// test/gateway/ETHSwapGateway.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits, parseEther } from "viem";

const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
const BURNER_ROLE  = keccak256(toBytes("BURNER_ROLE"));
const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));

const ETH = (n: number | string) => parseEther(String(n));
const NUSD = (n: number | string) => parseUnits(String(n), 6);

// $2800 ETH/USD with 8 decimal Chainlink format
const PRICE_2800 = 280_000_000_000n; // 2800 * 1e8

describe("ETHSwapGateway", () => {
  let viem: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let nusd: any;
  let oracle: any;
  let vault: any;
  let priceFeed: any;
  let gateway: any;
  let publicClient: any;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;
    publicClient = await viem.getPublicClient();

    const [adminClient, userClient] = await viem.getWalletClients();
    admin = adminClient.account.address;
    user  = userClient.account.address;

    // ── Deploy NUSD stablecoin ──────────────────────────────────────────────
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);

    // ── Deploy YieldVault (ERC-4626) ───────────────────────────────────────
    oracle = await viem.deployContract("NAVOracle", [admin]);
    await oracle.write.grantRole([REPORTER_ROLE, admin]);
    vault = await viem.deployContract("YieldVault", [
      nusd.address,
      oracle.address,
      "Nexus Treasury Vault",
      "nxTREASURY",
    ]);

    // ── Deploy MockPriceFeed + ETHSwapGateway ──────────────────────────────
    priceFeed = await viem.deployContract("MockPriceFeed", [PRICE_2800, admin]);
    gateway = await viem.deployContract("ETHSwapGateway", [
      nusd.address,
      priceFeed.address,
      admin,
    ]);

    // ── Grant gateway MINTER + BURNER roles on NUSD ────────────────────────
    await nusd.write.grantRole([MINTER_ROLE, gateway.address]);
    await nusd.write.grantRole([BURNER_ROLE, gateway.address]);

    // ── Seed gateway with ETH for redemptions (1 ETH) ─────────────────────
    const [adminWallet] = await viem.getWalletClients();
    await adminWallet.sendTransaction({ to: gateway.address, value: ETH(1) });
  });

  // ──────────────────────────────────────────────
  //  View helpers
  // ──────────────────────────────────────────────

  describe("view helpers", () => {
    it("ethPrice returns oracle price", async () => {
      const price = await gateway.read.ethPrice();
      assert.equal(price, PRICE_2800);
    });

    it("quoteBuyNUSD: 1 ETH → 2800 NUSD", async () => {
      const out = await gateway.read.quoteBuyNUSD([ETH(1)]);
      assert.equal(out, NUSD(2800));
    });

    it("quoteSellNUSD: 2800 NUSD → 1 ETH", async () => {
      const out = await gateway.read.quoteSellNUSD([NUSD(2800)]);
      assert.equal(out, ETH(1));
    });
  });

  // ──────────────────────────────────────────────
  //  buyNUSD
  // ──────────────────────────────────────────────

  describe("buyNUSD", () => {
    it("mints correct NUSD for ETH sent", async () => {
      const [, userWallet] = await viem.getWalletClients();
      const before = await nusd.read.balanceOf([user]);

      await gateway.write.buyNUSD([0n], {
        account: userWallet.account,
        value: ETH("0.5"),
      });

      const after = await nusd.read.balanceOf([user]);
      assert.equal(after - before, NUSD(1400)); // 0.5 ETH * $2800 = $1400
    });

    it("reverts when slippage threshold not met", async () => {
      const [, userWallet] = await viem.getWalletClients();
      await assert.rejects(
        () => gateway.write.buyNUSD([NUSD(9999)], {
          account: userWallet.account,
          value: ETH("0.1"),
        }),
        /SlippageExceeded/,
      );
    });

    it("reverts with zero ETH", async () => {
      const [, userWallet] = await viem.getWalletClients();
      await assert.rejects(
        () => gateway.write.buyNUSD([0n], {
          account: userWallet.account,
          value: 0n,
        }),
        /ZeroAmount/,
      );
    });
  });

  // ──────────────────────────────────────────────
  //  sellNUSD
  // ──────────────────────────────────────────────

  describe("sellNUSD", () => {
    it("returns correct ETH for NUSD sold", async () => {
      const [, userWallet] = await viem.getWalletClients();

      // First buy some NUSD
      await gateway.write.buyNUSD([0n], {
        account: userWallet.account,
        value: ETH(1),
      });
      const nusdBal = await nusd.read.balanceOf([user]);
      assert.ok(nusdBal >= NUSD(2800));

      // Track ETH balance before sell
      const ethBefore = await publicClient.getBalance({ address: user });

      // Approve gateway and sell 2800 NUSD
      await nusd.write.approve([gateway.address, NUSD(2800)], { account: userWallet.account });
      const tx = await gateway.write.sellNUSD([NUSD(2800), 0n], { account: userWallet.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

      const ethAfter = await publicClient.getBalance({ address: user });
      const ethGained = ethAfter - ethBefore + gasUsed;

      // Should have received ~1 ETH (allow 0.1% tolerance for rounding)
      const expected = ETH(1);
      const tolerance = expected / 1000n;
      assert.ok(
        ethGained >= expected - tolerance && ethGained <= expected + tolerance,
        `Expected ~1 ETH, got ${ethGained}`,
      );
    });

    it("reverts when gateway has insufficient ETH reserves", async () => {
      const [, userWallet] = await viem.getWalletClients();

      // Give user a large NUSD balance
      await nusd.write.mint([user, NUSD(100_000)]);
      await nusd.write.approve([gateway.address, NUSD(100_000)], { account: userWallet.account });

      // 100,000 NUSD ≈ 35.7 ETH — more than seeded reserves
      await assert.rejects(
        () => gateway.write.sellNUSD([NUSD(100_000), 0n], { account: userWallet.account }),
        /InsufficientETHReserves/,
      );
    });
  });

  // ──────────────────────────────────────────────
  //  buyVaultShares
  // ──────────────────────────────────────────────

  describe("buyVaultShares", () => {
    it("deposits ETH, receives vault shares", async () => {
      const [, userWallet] = await viem.getWalletClients();

      // No NAV pre-seeded — vault falls back to actual balance (0), giving 1:1 shares on first deposit.
      // Posting a large NAV before any shares exist causes 0-share rounding due to integer division.

      const sharesBefore = await vault.read.balanceOf([user]);

      await gateway.write.buyVaultShares([vault.address, 0n], {
        account: userWallet.account,
        value: ETH("0.1"),
      });

      const sharesAfter = await vault.read.balanceOf([user]);
      assert.ok(sharesAfter > sharesBefore, "should have received vault shares");
    });

    it("reverts with zero ETH", async () => {
      const [, userWallet] = await viem.getWalletClients();
      await assert.rejects(
        () => gateway.write.buyVaultShares([vault.address, 0n], {
          account: userWallet.account,
          value: 0n,
        }),
        /ZeroAmount/,
      );
    });
  });

  // ──────────────────────────────────────────────
  //  sellVaultShares
  // ──────────────────────────────────────────────

  describe("sellVaultShares", () => {
    it("redeems vault shares for ETH", async () => {
      const [, userWallet] = await viem.getWalletClients();

      // Buy shares first
      await gateway.write.buyVaultShares([vault.address, 0n], {
        account: userWallet.account,
        value: ETH("0.1"),
      });
      const shares = await vault.read.balanceOf([user]);
      assert.ok(shares > 0n);

      const ethBefore = await publicClient.getBalance({ address: user });

      // Approve gateway to spend vault shares
      await vault.write.approve([gateway.address, shares], { account: userWallet.account });
      const tx = await gateway.write.sellVaultShares([vault.address, shares, 0n], {
        account: userWallet.account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

      const ethAfter = await publicClient.getBalance({ address: user });
      assert.ok(ethAfter + gasUsed > ethBefore, "should have received ETH");
    });
  });

  // ──────────────────────────────────────────────
  //  MockPriceFeed
  // ──────────────────────────────────────────────

  describe("MockPriceFeed.setPrice", () => {
    it("admin can update price", async () => {
      await priceFeed.write.setPrice([350_000_000_000n]); // $3500
      const price = await gateway.read.ethPrice();
      assert.equal(price, 350_000_000_000n);

      // Reset
      await priceFeed.write.setPrice([PRICE_2800]);
    });
  });
});
