// test/compliance/KYCRegistry.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

describe("KYCRegistry", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let registry: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, userClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    user = userClient.account.address;

    registry = await viem.deployContract("KYCRegistry", [admin]);
    await registry.write.grantRole([VERIFIER_ROLE, admin]);
  });

  describe("setVerified", () => {
    it("verifier can set KYC status", async () => {
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000)) + 365n * 86400n;
      await registry.write.setVerified([user, futureExpiry]);
      const verified = await registry.read.isVerified([user]);
      assert.ok(verified);
    });

    it("getStatus returns full struct", async () => {
      const status = await registry.read.getStatus([user]);
      assert.ok(status.verified);
      assert.ok(status.expiry > 0n);
      assert.ok(status.verifiedAt > 0n);
    });

    it("rejects zero address", async () => {
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
      await assert.rejects(
        async () =>
          registry.write.setVerified([
            "0x0000000000000000000000000000000000000000",
            futureExpiry,
          ]),
        /revert/i,
      );
    });

    it("rejects expiry in the past", async () => {
      await assert.rejects(
        async () => registry.write.setVerified([user, 1n]),
        /revert/i,
      );
    });

    it("non-verifier cannot set KYC", async () => {
      const [, userClient] = await viem.getWalletClients();
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
      await assert.rejects(
        async () =>
          registry.write.setVerified([user, futureExpiry], {
            account: userClient.account,
          }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("revokeVerification", () => {
    it("verifier can revoke KYC", async () => {
      await registry.write.revokeVerification([user]);
      const verified = await registry.read.isVerified([user]);
      assert.equal(verified, false);
    });
  });

  describe("batchSetVerified", () => {
    it("verifies multiple addresses", async () => {
      const clients = await viem.getWalletClients();
      const addr2 = clients[2]?.account.address || admin;
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000)) + 365n * 86400n;
      await registry.write.batchSetVerified([[user, addr2], futureExpiry]);

      const v1 = await registry.read.isVerified([user]);
      const v2 = await registry.read.isVerified([addr2]);
      assert.ok(v1);
      assert.ok(v2);
    });

    it("rejects empty array", async () => {
      const futureExpiry = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
      await assert.rejects(
        async () => registry.write.batchSetVerified([[], futureExpiry]),
        /revert/i,
      );
    });
  });
});
