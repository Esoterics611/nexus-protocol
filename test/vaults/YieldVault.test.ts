// test/vaults/YieldVault.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));
const ADMIN_ROLE = keccak256(toBytes("ADMIN_ROLE"));

const USDC = (n: number) => parseUnits(String(n), 6); // 6-decimal amounts

describe("YieldVault", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let nusd: any;        // NexusStableCoin proxy (underlying asset)
  let oracle: any;      // NAVOracle
  let vault: any;       // YieldVault

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, userClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    user  = userClient.account.address;

    // Deploy stablecoin as the underlying deposit token
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);

    // Deploy NAVOracle and grant reporter role to admin
    oracle = await viem.deployContract("NAVOracle", [admin]);
    await oracle.write.grantRole([REPORTER_ROLE, admin]);

    // Deploy YieldVault
    vault = await viem.deployContract("YieldVault", [
      nusd.address,
      oracle.address,
      "Nexus Treasury Vault",
      "nxTREASURY",
    ]);

    // Mint NUSD to user for deposit tests
    await nusd.write.mint([user, USDC(10_000)]);
  });

  describe("deposit / withdraw", () => {
    it("user can deposit and receives shares 1:1 at inception", async () => {
      const depositAmount = USDC(1_000);
      const [, userClient] = await viem.getWalletClients();

      // Approve vault to spend NUSD
      await nusd.write.approve([vault.address, depositAmount], { account: userClient.account });

      // Deposit
      await vault.write.deposit([depositAmount, user], { account: userClient.account });

      const shares = await vault.read.balanceOf([user]);
      assert.equal(shares, depositAmount, "shares should equal deposited assets 1:1 at inception");
    });

    it("user can redeem shares for underlying assets", async () => {
      const [, userClient] = await viem.getWalletClients();
      const sharesBefore = await vault.read.balanceOf([user]);
      const nusdBefore   = await nusd.read.balanceOf([user]);

      // Redeem all shares
      await vault.write.redeem([sharesBefore, user, user], { account: userClient.account });

      const sharesAfter = await vault.read.balanceOf([user]);
      const nusdAfter   = await nusd.read.balanceOf([user]);

      assert.equal(sharesAfter, 0n, "shares should be zero after full redeem");
      assert.ok(nusdAfter > nusdBefore, "NUSD balance should increase after redeem");
    });
  });

  describe("NAV oracle", () => {
    it("totalAssets() falls back to token balance when oracle is empty", async () => {
      // Deploy a fresh vault with an oracle that has no entries
      const freshOracle = await viem.deployContract("NAVOracle", [admin]);
      const freshVault  = await viem.deployContract("YieldVault", [
        nusd.address,
        freshOracle.address,
        "Fresh Vault",
        "FRESH",
      ]);

      // Deposit some NUSD into the vault
      const [, userClient] = await viem.getWalletClients();
      const amount = USDC(500);
      await nusd.write.mint([user, amount]);
      await nusd.write.approve([freshVault.address, amount], { account: userClient.account });
      await freshVault.write.deposit([amount, user], { account: userClient.account });

      const totalAssets = await freshVault.read.totalAssets();
      assert.equal(totalAssets, amount, "totalAssets should equal token balance when oracle has no entries");
    });

    it("totalAssets() returns oracle NAV when set", async () => {
      // Deposit into main vault to establish a non-zero supply
      const [, userClient] = await viem.getWalletClients();
      const depositAmount = USDC(2_000);
      await nusd.write.mint([user, depositAmount]);
      await nusd.write.approve([vault.address, depositAmount], { account: userClient.account });
      await vault.write.deposit([depositAmount, user], { account: userClient.account });

      // Report a NAV higher than actual token balance (simulating yield)
      const reportedNAV = USDC(2_500);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await oracle.write.postNAV([reportedNAV, ts]);

      const totalAssets = await vault.read.totalAssets();
      assert.equal(totalAssets, reportedNAV, "totalAssets should return oracle NAV");
    });

    it("share price increases after positive NAV update", async () => {
      // Calculate preview of redeeming 1 share — should reflect NAV > token balance
      const oneShare = USDC(1);
      const assets = await vault.read.previewRedeem([oneShare]);
      assert.ok(assets > oneShare, "each share should be worth more than 1 asset after yield");
    });
  });

  describe("transfer restrictions", () => {
    it("blocks transfers when recipient is on denylist", async () => {
      const restrictionList = await viem.deployContract("RestrictionList", [admin]);
      const kycRegistry     = await viem.deployContract("KYCRegistry", [admin]);
      const restrictions    = await viem.deployContract("TransferRestrictions", [
        admin, restrictionList.address, kycRegistry.address, false,
      ]);

      // Attach restrictions to a fresh vault
      const restrictedVault = await viem.deployContract("YieldVault", [
        nusd.address, oracle.address, "Restricted Vault", "RV",
      ]);
      await restrictedVault.write.setTransferRestrictions([restrictions.address]);

      // Deposit to get shares
      const [, userClient] = await viem.getWalletClients();
      const amount = USDC(100);
      await nusd.write.mint([user, amount]);
      await nusd.write.approve([restrictedVault.address, amount], { account: userClient.account });
      await restrictedVault.write.deposit([amount, user], { account: userClient.account });

      // Restrict the user
      const RESTRICTOR_ROLE = keccak256(toBytes("RESTRICTOR_ROLE"));
      await restrictionList.write.grantRole([RESTRICTOR_ROLE, admin]);
      await restrictionList.write.restrict([user]);

      // Transfer should now revert
      await assert.rejects(
        async () => {
          const [adminClient] = await viem.getWalletClients();
          await restrictedVault.write.transfer([admin, USDC(10)], { account: userClient.account });
        },
        /revert|TransferRestricted/i,
      );
    });
  });

  describe("admin", () => {
    it("admin can swap out the oracle", async () => {
      const newOracle = await viem.deployContract("NAVOracle", [admin]);
      await vault.write.setOracle([newOracle.address]);
      const oracleAddr = await vault.read.oracle();
      assert.equal(oracleAddr.toLowerCase(), newOracle.address.toLowerCase());
    });

    it("non-admin cannot set oracle", async () => {
      const [, userClient] = await viem.getWalletClients();
      const newOracle = await viem.deployContract("NAVOracle", [admin]);
      await assert.rejects(
        async () => vault.write.setOracle([newOracle.address], { account: userClient.account }),
        /revert|AccessControl/i,
      );
    });
  });
});
