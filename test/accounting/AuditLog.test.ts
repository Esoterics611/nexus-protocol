// test/accounting/AuditLog.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes, toHex } from "viem";

const LOGGER_ROLE = keccak256(toBytes("LOGGER_ROLE"));

describe("AuditLog", () => {
  let viem: any;
  let admin: `0x${string}`;
  let auditLog: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient] = await viem.getWalletClients();
    admin = adminClient.account.address;

    auditLog = await viem.deployContract("AuditLog", [admin]);
    await auditLog.write.grantRole([LOGGER_ROLE, admin]);
  });

  describe("log", () => {
    it("logger can write an audit entry", async () => {
      await auditLog.write.log(["MINT", "Minted 1000 NUSD", "0x"]);
      const id = await auditLog.read.nextEntryId();
      assert.equal(id, 1n);
    });

    it("increments entry ID", async () => {
      await auditLog.write.log(["TRANSFER", "Transfer blocked", "0x"]);
      const id = await auditLog.read.nextEntryId();
      assert.equal(id, 2n);
    });

    it("non-logger cannot write", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () =>
          auditLog.write.log(["HACK", "Should fail", "0x"], {
            account: userClient.account,
          }),
        /revert|AccessControl/i,
      );
    });

    it("accepts arbitrary data payload", async () => {
      const data = toHex("custom payload data");
      await auditLog.write.log(["RESERVE", "Reserve updated", data]);
      const id = await auditLog.read.nextEntryId();
      assert.equal(id, 3n);
    });
  });
});
