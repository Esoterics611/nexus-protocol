// test/stablecoin/NexusStableCoin.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const MINTER_ROLE    = keccak256(toBytes("MINTER_ROLE"));
const BURNER_ROLE    = keccak256(toBytes("BURNER_ROLE"));
const PAUSER_ROLE    = keccak256(toBytes("PAUSER_ROLE"));
const RESTRICTOR_ROLE = keccak256(toBytes("RESTRICTOR_ROLE"));

const USDC = (n: number) => parseUnits(String(n), 6);

describe("NexusStableCoin", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let stranger: `0x${string}`;
  let stablecoin: any;
  let restrictionList: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, userClient, strangerClient] = await viem.getWalletClients();
    admin    = adminClient.account.address;
    user     = userClient.account.address;
    stranger = strangerClient.account.address;

    // Deploy implementation + proxy
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    stablecoin = await viem.getContractAt("NexusStableCoin", proxy.address);

    // Deploy restriction list
    restrictionList = await viem.deployContract("RestrictionList", [admin]);
  });

  describe("metadata", () => {
    it("has correct name and symbol", async () => {
      const name   = await stablecoin.read.name();
      const symbol = await stablecoin.read.symbol();
      assert.equal(name, "Nexus USD");
      assert.equal(symbol, "NUSD");
    });

    it("has 6 decimals", async () => {
      const decimals = await stablecoin.read.decimals();
      assert.equal(decimals, 6);
    });

    it("admin has all roles", async () => {
      const hasMinter  = await stablecoin.read.hasRole([MINTER_ROLE, admin]);
      const hasBurner  = await stablecoin.read.hasRole([BURNER_ROLE, admin]);
      const hasPauser  = await stablecoin.read.hasRole([PAUSER_ROLE, admin]);
      assert.ok(hasMinter);
      assert.ok(hasBurner);
      assert.ok(hasPauser);
    });
  });

  describe("mint", () => {
    it("MINTER_ROLE can mint tokens", async () => {
      const amount = USDC(1_000);
      await stablecoin.write.mint([user, amount]);
      const balance = await stablecoin.read.balanceOf([user]);
      assert.equal(balance, amount);
    });

    it("non-minter cannot mint", async () => {
      const [, , strangerClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => stablecoin.write.mint([stranger, USDC(1)], { account: strangerClient.account }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("burn", () => {
    it("BURNER_ROLE can burn tokens from any address", async () => {
      const mintAmount = USDC(500);
      await stablecoin.write.mint([user, mintAmount]);
      const balanceBefore = await stablecoin.read.balanceOf([user]);

      await stablecoin.write.burn([user, mintAmount]);
      const balanceAfter = await stablecoin.read.balanceOf([user]);

      assert.equal(balanceAfter, balanceBefore - mintAmount);
    });

    it("non-burner cannot burn", async () => {
      const [, , strangerClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => stablecoin.write.burn([user, USDC(1)], { account: strangerClient.account }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("pause", () => {
    it("PAUSER_ROLE can pause transfers", async () => {
      await stablecoin.write.pause();
      const paused = await stablecoin.read.paused();
      assert.ok(paused);
    });

    it("transfers revert while paused", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => stablecoin.write.transfer([stranger, USDC(1)], { account: userClient.account }),
        /revert|EnforcedPause/i,
      );
    });

    it("minting also reverts while paused", async () => {
      await assert.rejects(
        async () => stablecoin.write.mint([user, USDC(1)]),
        /revert|EnforcedPause/i,
      );
    });

    it("PAUSER_ROLE can unpause", async () => {
      await stablecoin.write.unpause();
      const paused = await stablecoin.read.paused();
      assert.ok(!paused);
    });

    it("transfers work again after unpause", async () => {
      const amount = USDC(100);
      await stablecoin.write.mint([user, amount]);
      const [, userClient] = await viem.getWalletClients();
      await stablecoin.write.transfer([stranger, amount], { account: userClient.account });
      const strangerBal = await stablecoin.read.balanceOf([stranger]);
      assert.ok(strangerBal >= amount);
    });
  });

  describe("restriction list", () => {
    before(async () => {
      // Attach restriction list to stablecoin
      await stablecoin.write.setRestrictionList([restrictionList.address]);
    });

    it("transfer to restricted address reverts", async () => {
      // Restrict stranger
      await restrictionList.write.restrict([stranger]);

      await stablecoin.write.mint([user, USDC(200)]);
      const [, userClient] = await viem.getWalletClients();

      await assert.rejects(
        async () => stablecoin.write.transfer([stranger, USDC(100)], { account: userClient.account }),
        /revert|AddressRestricted/i,
      );
    });

    it("transfer from restricted address reverts", async () => {
      // Temporarily unrestrict stranger to mint their balance, then re-restrict
      await restrictionList.write.unrestrict([stranger]);
      await stablecoin.write.mint([stranger, USDC(100)]);
      await restrictionList.write.restrict([stranger]);

      const [, , strangerClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => stablecoin.write.transfer([user, USDC(50)], { account: strangerClient.account }),
        /revert|AddressRestricted/i,
      );
    });

    it("transfer allowed once address is unrestricted", async () => {
      await restrictionList.write.unrestrict([stranger]);

      const [, , strangerClient] = await viem.getWalletClients();
      const balBefore = await stablecoin.read.balanceOf([user]);
      await stablecoin.write.transfer([user, USDC(10)], { account: strangerClient.account });
      const balAfter = await stablecoin.read.balanceOf([user]);

      assert.ok(balAfter > balBefore);
    });
  });
});
