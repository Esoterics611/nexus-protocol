// test/stablecoin/RestrictionList.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const RESTRICTOR_ROLE = keccak256(toBytes("RESTRICTOR_ROLE"));

describe("RestrictionList", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let target: `0x${string}`;
  let list: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const clients = await viem.getWalletClients();
    admin = clients[0].account.address;
    user = clients[1].account.address;
    target = clients[2].account.address;

    list = await viem.deployContract("RestrictionList", [admin]);
  });

  describe("restrict / unrestrict", () => {
    it("admin can restrict an address", async () => {
      await list.write.restrict([target]);
      const restricted = await list.read.isRestricted([target]);
      assert.ok(restricted);
    });

    it("admin can unrestrict an address", async () => {
      await list.write.unrestrict([target]);
      const restricted = await list.read.isRestricted([target]);
      assert.equal(restricted, false);
    });

    it("rejects zero address", async () => {
      await assert.rejects(
        async () =>
          list.write.restrict(["0x0000000000000000000000000000000000000000"]),
        /revert/i,
      );
    });

    it("non-restrictor cannot restrict", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => list.write.restrict([target], { account: userClient.account }),
        /revert|AccessControl/i,
      );
    });
  });

  describe("batch operations", () => {
    it("batchRestrict adds multiple addresses", async () => {
      await list.write.batchRestrict([[admin, target]]);
      const r1 = await list.read.isRestricted([admin]);
      const r2 = await list.read.isRestricted([target]);
      assert.ok(r1);
      assert.ok(r2);
    });

    it("batchUnrestrict removes multiple addresses", async () => {
      await list.write.batchUnrestrict([[admin, target]]);
      const r1 = await list.read.isRestricted([admin]);
      const r2 = await list.read.isRestricted([target]);
      assert.equal(r1, false);
      assert.equal(r2, false);
    });
  });
});
