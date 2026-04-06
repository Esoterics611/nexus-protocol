// test/compliance/AccreditedInvestor.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

describe("AccreditedInvestor", () => {
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

    registry = await viem.deployContract("AccreditedInvestor", [admin]);
    await registry.write.grantRole([VERIFIER_ROLE, admin]);
  });

  describe("setAccredited", () => {
    it("verifier can accredit an address", async () => {
      await registry.write.setAccredited([user, true]);
      const result = await registry.read.isAccredited([user]);
      assert.ok(result);
    });

    it("verifier can revoke accreditation", async () => {
      await registry.write.setAccredited([user, false]);
      const result = await registry.read.isAccredited([user]);
      assert.equal(result, false);
    });

    it("rejects zero address", async () => {
      await assert.rejects(
        async () =>
          registry.write.setAccredited([
            "0x0000000000000000000000000000000000000000",
            true,
          ]),
        /revert/i,
      );
    });

    it("non-verifier cannot set accreditation", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () =>
          registry.write.setAccredited([user, true], {
            account: userClient.account,
          }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("batchSetAccredited", () => {
    it("accredits multiple addresses", async () => {
      const clients = await viem.getWalletClients();
      const addr2 = clients[2]?.account.address || admin;
      await registry.write.batchSetAccredited([[user, addr2], true]);

      const r1 = await registry.read.isAccredited([user]);
      const r2 = await registry.read.isAccredited([addr2]);
      assert.ok(r1);
      assert.ok(r2);
    });

    it("rejects empty array", async () => {
      await assert.rejects(
        async () => registry.write.batchSetAccredited([[], true]),
        /revert/i,
      );
    });
  });
});
