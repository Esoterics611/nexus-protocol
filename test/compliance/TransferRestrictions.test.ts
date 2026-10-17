// test/compliance/TransferRestrictions.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, toBytes } from "viem";

const VERIFIER_ROLE   = keccak256(toBytes("VERIFIER_ROLE"));
const RESTRICTOR_ROLE = keccak256(toBytes("RESTRICTOR_ROLE"));

describe("TransferRestrictions", () => {
  let viem: any;
  let admin: `0x${string}`;
  let alice: `0x${string}`;
  let bob: `0x${string}`;

  let restrictionList: any;
  let kycRegistry: any;
  let restrictions: any;   // TransferRestrictions (KYC not required)

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, aliceClient, bobClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    alice = aliceClient.account.address;
    bob   = bobClient.account.address;

    restrictionList = await viem.deployContract("RestrictionList", [admin]);
    kycRegistry     = await viem.deployContract("KYCRegistry", [admin]);

    // KYC not required initially
    restrictions = await viem.deployContract("TransferRestrictions", [
      admin,
      restrictionList.address,
      kycRegistry.address,
      false,
    ]);

    // Grant roles
    await restrictionList.write.grantRole([RESTRICTOR_ROLE, admin]);
    await kycRegistry.write.grantRole([VERIFIER_ROLE, admin]);
  });

  describe("denylist", () => {
    it("allows transfer when neither party is restricted", async () => {
      const allowed = await restrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(allowed);
    });

    it("blocks transfer when sender is restricted", async () => {
      await restrictionList.write.restrict([alice]);
      const allowed = await restrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(!allowed);
      await restrictionList.write.unrestrict([alice]);
    });

    it("blocks transfer when recipient is restricted", async () => {
      await restrictionList.write.restrict([bob]);
      const allowed = await restrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(!allowed);
      await restrictionList.write.unrestrict([bob]);
    });

    it("allows mint (from=0) even if zero address is checked", async () => {
      const allowed = await restrictions.read.isTransferAllowed([
        "0x0000000000000000000000000000000000000000", bob, 100n,
      ]);
      assert.ok(allowed);
    });

    it("allows burn (to=0)", async () => {
      const allowed = await restrictions.read.isTransferAllowed([
        alice, "0x0000000000000000000000000000000000000000", 100n,
      ]);
      assert.ok(allowed);
    });
  });

  describe("KYC enforcement", () => {
    let kycRestrictions: any;

    before(async () => {
      // Deploy separate instance with KYC required
      kycRestrictions = await viem.deployContract("TransferRestrictions", [
        admin,
        restrictionList.address,
        kycRegistry.address,
        true,
      ]);
    });

    it("blocks transfer when sender is unverified", async () => {
      const allowed = await kycRestrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(!allowed, "unverified alice should be blocked");
    });

    it("blocks transfer when only sender is verified", async () => {
      const farFuture = BigInt(Math.floor(Date.now() / 1000) + 86400 * 365);
      await kycRegistry.write.setVerified([alice, farFuture]);
      const allowed = await kycRestrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(!allowed, "unverified bob should still block the transfer");
    });

    it("allows transfer when both parties are verified", async () => {
      const farFuture = BigInt(Math.floor(Date.now() / 1000) + 86400 * 365);
      await kycRegistry.write.setVerified([bob, farFuture]);
      const allowed = await kycRestrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(allowed);
    });

    it("blocks again if a party is revoked", async () => {
      await kycRegistry.write.revokeVerification([alice]);
      const allowed = await kycRestrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(!allowed);
    });

    it("KYC requirement can be toggled off", async () => {
      await kycRestrictions.write.setKYCRequired([false]);
      // alice is still unverified but KYC is off
      const allowed = await kycRestrictions.read.isTransferAllowed([alice, bob, 100n]);
      assert.ok(allowed);
    });
  });

  describe("admin config", () => {
    it("admin can replace restriction list", async () => {
      const newList = await viem.deployContract("RestrictionList", [admin]);
      await restrictions.write.setRestrictionList([newList.address]);
      const stored = await restrictions.read.restrictionList();
      assert.equal(stored.toLowerCase(), newList.address.toLowerCase());
    });

    it("admin can replace KYC registry", async () => {
      const newKyc = await viem.deployContract("KYCRegistry", [admin]);
      await restrictions.write.setKYCRegistry([newKyc.address]);
      const stored = await restrictions.read.kycRegistry();
      assert.equal(stored.toLowerCase(), newKyc.address.toLowerCase());
    });

    it("non-admin cannot change configuration", async () => {
      const [, aliceClient] = await viem.getWalletClients();
      await assert.rejects(
        async () => restrictions.write.setKYCRequired([true], { account: aliceClient.account }),
        /revert|AccessControl/i,
      );
    });
  });
});
