// test/vaults/YieldVaultFactory.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

describe("YieldVaultFactory", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let nusd: any;
  let oracle: any;
  let factory: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const [adminClient, userClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    user = userClient.account.address;

    // Deploy stablecoin as deposit token
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);

    oracle = await viem.deployContract("NAVOracle", [admin]);
    factory = await viem.deployContract("YieldVaultFactory", [admin]);
  });

  describe("createVault", () => {
    it("admin can create a vault", async () => {
      const tx = await factory.write.createVault([
        nusd.address, oracle.address, "Treasury Vault", "nxTREASURY",
      ]);
      const count = await factory.read.getVaultCount();
      assert.equal(count, 1n);
    });

    it("created vault is registered", async () => {
      const vaultAddr = await factory.read.getVault([0n]);
      const registered = await factory.read.isVault([vaultAddr]);
      assert.ok(registered);
    });

    it("created vault has caller as admin", async () => {
      const vaultAddr = await factory.read.getVault([0n]);
      const vault = await viem.getContractAt("YieldVault", vaultAddr);
      const DEFAULT_ADMIN = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const hasRole = await vault.read.hasRole([DEFAULT_ADMIN, admin]);
      assert.ok(hasRole, "admin should have DEFAULT_ADMIN_ROLE on vault");
    });

    it("non-admin cannot create vault", async () => {
      const [, userClient] = await viem.getWalletClients();
      await assert.rejects(
        async () =>
          factory.write.createVault(
            [nusd.address, oracle.address, "Bad Vault", "BAD"],
            { account: userClient.account },
          ),
        /revert|AccessControl/i,
      );
    });

    it("can create multiple vaults", async () => {
      await factory.write.createVault([
        nusd.address, oracle.address, "Second Vault", "nxV2",
      ]);
      const count = await factory.read.getVaultCount();
      assert.equal(count, 2n);
    });
  });

  describe("view helpers", () => {
    it("getVault reverts for out-of-bounds index", async () => {
      const count = await factory.read.getVaultCount();
      await assert.rejects(
        async () => factory.read.getVault([count]),
        /revert|out of bounds/i,
      );
    });

    it("isVault returns false for unknown address", async () => {
      const result = await factory.read.isVault([admin]);
      assert.equal(result, false);
    });
  });
});
