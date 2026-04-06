// test/stablecoin/MintController.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const MINTER_ROLE    = keccak256(toBytes("MINTER_ROLE"));
const ALLOCATOR_ROLE = keccak256(toBytes("ALLOCATOR_ROLE"));

const USDC = (n: number) => parseUnits(String(n), 6);

describe("MintController", () => {
  let viem: any;
  let admin: `0x${string}`;
  let minter: `0x${string}`;
  let recipient: `0x${string}`;
  let stablecoin: any;
  let controller: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, minterClient, recipientClient] = await viem.getWalletClients();
    admin     = adminClient.account.address;
    minter    = minterClient.account.address;
    recipient = recipientClient.account.address;

    // Deploy stablecoin proxy
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    stablecoin = await viem.getContractAt("NexusStableCoin", proxy.address);

    // Deploy MintController
    controller = await viem.deployContract("MintController", [stablecoin.address, admin]);

    // Grant MINTER_ROLE on stablecoin to controller
    await stablecoin.write.grantRole([MINTER_ROLE, controller.address]);
  });

  describe("allocation management", () => {
    it("allocator can set mint ceiling for minter", async () => {
      const ceiling = USDC(5_000);
      await controller.write.setMintAllocation([minter, ceiling]);
      const allocation = await controller.read.mintAllocation([minter]);
      assert.equal(allocation, ceiling);
    });

    it("remaining allocation equals ceiling before any minting", async () => {
      const ceiling   = await controller.read.mintAllocation([minter]);
      const remaining = await controller.read.remainingAllocation([minter]);
      assert.equal(remaining, ceiling);
    });

    it("non-allocator cannot set allocation", async () => {
      const [, minterClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => controller.write.setMintAllocation([minter, USDC(1)], { account: minterClient.account }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("minting through controller", () => {
    it("minter can mint up to their ceiling", async () => {
      const mintAmount = USDC(1_000);
      const [, minterClient] = await viem.getWalletClients();

      await controller.write.mint([recipient, mintAmount], { account: minterClient.account });

      const balance = await stablecoin.read.balanceOf([recipient]);
      assert.equal(balance, mintAmount);
    });

    it("remaining allocation decreases after mint", async () => {
      const ceiling   = await controller.read.mintAllocation([minter]);
      const minted    = await controller.read.mintedAmount([minter]);
      const remaining = await controller.read.remainingAllocation([minter]);
      assert.equal(remaining, ceiling - minted);
    });

    it("minting beyond ceiling reverts", async () => {
      const [, minterClient] = await viem.getWalletClients();
      const remaining = await controller.read.remainingAllocation([minter]);
      const overLimit = remaining + USDC(1);

      await assert.rejects(
        async () => controller.write.mint([recipient, overLimit], { account: minterClient.account }),
        /revert|AllocationExceeded/i,
      );
    });

    it("address with no allocation cannot mint", async () => {
      const [, , recipientClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => controller.write.mint([admin, USDC(1)], { account: recipientClient.account }),
        /revert|AllocationExceeded/i,
      );
    });
  });

  describe("allocation reset", () => {
    it("admin can reset minted amount", async () => {
      await controller.write.resetMintedAmount([minter]);
      const minted = await controller.read.mintedAmount([minter]);
      assert.equal(minted, 0n);
    });

    it("minter can mint again after reset", async () => {
      const [, minterClient] = await viem.getWalletClients();
      const ceiling = await controller.read.mintAllocation([minter]);

      await controller.write.mint([recipient, ceiling], { account: minterClient.account });

      const minted = await controller.read.mintedAmount([minter]);
      assert.equal(minted, ceiling);
    });

    it("non-admin cannot reset minted amount", async () => {
      const [, , recipientClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => controller.write.resetMintedAmount([minter], { account: recipientClient.account }),
        /revert|AccessControl/i,
      );
    });
  });
});
