// test/accounting/ReserveTracker.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));

describe("ReserveTracker", () => {
  let viem: any;
  let admin: `0x${string}`;
  let tracker: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient] = await viem.getWalletClients();
    admin = adminClient.account.address;

    tracker = await viem.deployContract("ReserveTracker", [admin]);
    await tracker.write.grantRole([REPORTER_ROLE, admin]);
  });

  describe("postReserve", () => {
    it("reporter can post a reserve entry", async () => {
      await tracker.write.postReserve(["USDC", 1_000_000n]);
      const count = await tracker.read.getReserveCount();
      assert.equal(count, 1n);
    });

    it("rejects empty asset type", async () => {
      await assert.rejects(
        async () => tracker.write.postReserve(["", 100n]),
        /revert/i,
      );
    });

    it("non-reporter cannot post", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () =>
          tracker.write.postReserve(["USDC", 100n], {
            account: userClient.account,
          }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("view functions", () => {
    it("getLatestReserve returns last entry", async () => {
      await tracker.write.postReserve(["T-Bill", 5_000_000n]);
      const entry = await tracker.read.getLatestReserve();
      assert.equal(entry.assetType, "T-Bill");
      assert.equal(entry.amount, 5_000_000n);
    });

    it("getTotalReserves sums latest per asset type", async () => {
      const total = await tracker.read.getTotalReserves();
      // USDC: 1_000_000 + T-Bill: 5_000_000 = 6_000_000
      assert.equal(total, 6_000_000n);
    });

    it("updating an asset type replaces its latest value in total", async () => {
      await tracker.write.postReserve(["USDC", 2_000_000n]);
      const total = await tracker.read.getTotalReserves();
      // USDC: 2_000_000 + T-Bill: 5_000_000 = 7_000_000
      assert.equal(total, 7_000_000n);
    });

    it("getReserveHistory returns all entries", async () => {
      const history = await tracker.read.getReserveHistory();
      assert.equal(history.length, 3); // USDC, T-Bill, USDC update
    });

    it("getLatestReserve reverts when empty", async () => {
      const fresh = await viem.deployContract("ReserveTracker", [admin]);
      await assert.rejects(
        async () => fresh.read.getLatestReserve(),
        /revert/i,
      );
    });
  });
});
