// test/vaults/YieldDistributor.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const DISTRIBUTOR_ROLE = keccak256(toBytes("DISTRIBUTOR_ROLE"));
const USDC = (n: number) => parseUnits(String(n), 6);

describe("YieldDistributor", () => {
  let viem: any;
  let admin: `0x${string}`;
  let recipientA: `0x${string}`;
  let recipientB: `0x${string}`;
  let nusd: any;
  let distributor: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const clients = await viem.getWalletClients();
    admin = clients[0].account.address;
    recipientA = clients[1].account.address;
    recipientB = clients[2].account.address;

    // Deploy stablecoin as yield token
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);

    distributor = await viem.deployContract("YieldDistributor", [nusd.address, admin]);
    await distributor.write.grantRole([DISTRIBUTOR_ROLE, admin]);

    // Mint tokens to admin for yield distribution
    await nusd.write.mint([admin, USDC(100_000)]);
    await nusd.write.approve([distributor.address, USDC(100_000)]);
  });

  describe("registerRecipient", () => {
    it("admin can register a recipient", async () => {
      await distributor.write.registerRecipient([recipientA, 100n]);
      const info = await distributor.read.recipients([recipientA]);
      assert.equal(info[0], 100n); // shares
    });

    it("rejects zero address", async () => {
      await assert.rejects(
        async () =>
          distributor.write.registerRecipient([
            "0x0000000000000000000000000000000000000000",
            100n,
          ]),
        /revert/i,
      );
    });

    it("rejects zero shares", async () => {
      await assert.rejects(
        async () => distributor.write.registerRecipient([recipientB, 0n]),
        /revert/i,
      );
    });
  });

  describe("yield distribution", () => {
    it("addYield distributes proportionally", async () => {
      // Register recipientB with equal shares
      await distributor.write.registerRecipient([recipientB, 100n]);

      // Add yield
      await distributor.write.addYield([USDC(1_000)]);

      // Each recipient should have 500 USDC pending
      const pendingA = await distributor.read.pendingYield([recipientA]);
      const pendingB = await distributor.read.pendingYield([recipientB]);
      assert.equal(pendingA, USDC(500));
      assert.equal(pendingB, USDC(500));
    });

    it("claimYield transfers tokens to recipient", async () => {
      const balBefore = await nusd.read.balanceOf([recipientA]);
      await distributor.write.claimYield([recipientA]);
      const balAfter = await nusd.read.balanceOf([recipientA]);
      assert.equal(balAfter - balBefore, USDC(500));
    });

    it("claimYield reverts when nothing to claim", async () => {
      await assert.rejects(
        async () => distributor.write.claimYield([recipientA]),
        /revert|nothing to claim/i,
      );
    });

    it("pendingYield returns 0 for unregistered address", async () => {
      const pending = await distributor.read.pendingYield([admin]);
      assert.equal(pending, 0n);
    });
  });

  describe("removeRecipient", () => {
    it("settles pending yield on removal", async () => {
      // recipientB still has 500 pending
      const balBefore = await nusd.read.balanceOf([recipientB]);
      await distributor.write.removeRecipient([recipientB]);
      const balAfter = await nusd.read.balanceOf([recipientB]);
      assert.equal(balAfter - balBefore, USDC(500));
    });

    it("rejects removal of non-registered address", async () => {
      await assert.rejects(
        async () => distributor.write.removeRecipient([recipientB]),
        /revert|not registered/i,
      );
    });
  });
});
