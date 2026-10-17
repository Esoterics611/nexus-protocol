// test/vaults/NAVOracle.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));

describe("NAVOracle", () => {
  let viem: any;
  let admin: `0x${string}`;
  let reporter: `0x${string}`;
  let oracle: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, reporterClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    reporter = reporterClient.account.address;

    oracle = await viem.deployContract("NAVOracle", [admin]);
    await oracle.write.grantRole([REPORTER_ROLE, reporter]);
  });

  describe("postNAV", () => {
    it("reporter can post a NAV entry", async () => {
      const [, reporterClient] = await viem.getWalletClients();
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await oracle.write.postNAV([1000n, ts], { account: reporterClient.account });

      const len = await oracle.read.getHistoryLength();
      assert.equal(len, 1n);
    });

    it("rejects zero totalAssets", async () => {
      const [, reporterClient] = await viem.getWalletClients();
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await assert.rejects(
        async () => oracle.write.postNAV([0n, ts], { account: reporterClient.account }),
        /revert/i,
      );
    });

    it("rejects timestamp older than last entry", async () => {
      const [, reporterClient] = await viem.getWalletClients();
      // Use a dedicated oracle to avoid shared-state ordering issues
      const freshOracle = await viem.deployContract("NAVOracle", [admin]);
      await freshOracle.write.grantRole([REPORTER_ROLE, reporter]);

      const ts = BigInt(Math.floor(Date.now() / 1000));
      await freshOracle.write.postNAV([500n, ts], { account: reporterClient.account });
      // Try to post at an earlier timestamp — should fail
      await assert.rejects(
        async () => freshOracle.write.postNAV([500n, ts - 1n], { account: reporterClient.account }),
        /revert/i,
      );
    });

    it("non-reporter cannot post", async () => {
      const clients = await viem.getWalletClients();
      const nonReporter = clients[2] || clients[0]; // use third account or admin without reporter role
      // Deploy a fresh oracle where admin does NOT have reporter role
      const freshOracle = await viem.deployContract("NAVOracle", [admin]);
      await assert.rejects(
        async () => freshOracle.write.postNAV([100n, 100n]),
        /revert|AccessControl/i,
      );
    });
  });

  describe("view functions", () => {
    it("getLatestNAV returns the most recent entry", async () => {
      const [, reporterClient] = await viem.getWalletClients();
      const ts = BigInt(Math.floor(Date.now() / 1000)) + 10000n;
      await oracle.write.postNAV([9999n, ts], { account: reporterClient.account });

      const [totalAssets, timestamp] = await oracle.read.getLatestNAV();
      assert.equal(totalAssets, 9999n);
      assert.equal(timestamp, ts);
    });

    it("getNAVAt returns entry by index", async () => {
      const entry = await oracle.read.getNAVAt([0n]);
      assert.equal(entry.totalAssets, 1000n);
    });

    it("getNAVAt reverts for out-of-bounds index", async () => {
      const len = await oracle.read.getHistoryLength();
      await assert.rejects(
        async () => oracle.read.getNAVAt([len]),
        /revert|out of bounds/i,
      );
    });

    it("getLatestNAV reverts when no entries exist", async () => {
      const freshOracle = await viem.deployContract("NAVOracle", [admin]);
      await assert.rejects(
        async () => freshOracle.read.getLatestNAV(),
        /revert|no entries/i,
      );
    });
  });
});
