// test/derivatives/YieldSplitter.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits, getContractAddress } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));
const MINTER_ROLE   = keccak256(toBytes("MINTER_ROLE"));

const NUSD = (n: number) => parseUnits(String(n), 6);

describe("YieldSplitter", () => {
  let viem: any;
  let publicClient: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let user2: `0x${string}`;
  let adminClient: any;
  let userClient: any;
  let user2Client: any;
  let nusd: any;
  let oracle: any;
  let vault: any;
  let pt: any;
  let yt: any;
  let splitter: any;
  let maturity: bigint;

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const wallets = await viem.getWalletClients();
    adminClient = wallets[0];
    userClient  = wallets[1];
    user2Client = wallets[2];
    admin = adminClient.account.address;
    user  = userClient.account.address;
    user2 = user2Client.account.address;
    publicClient = await viem.getPublicClient();

    // --- Deploy NUSD stablecoin (UUPS proxy) ---
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);

    // --- Deploy NAVOracle ---
    oracle = await viem.deployContract("NAVOracle", [admin]);
    await oracle.write.grantRole([REPORTER_ROLE, admin]);

    // --- Deploy YieldVault ---
    vault = await viem.deployContract("YieldVault", [
      nusd.address,
      oracle.address,
      "Nexus Treasury Vault",
      "nxTREASURY",
    ]);

    // --- Set maturity to 365 days from now ---
    const block = await publicClient.getBlock();
    maturity = block.timestamp + 365n * 24n * 60n * 60n;

    // --- Deploy PrincipalToken ---
    pt = await viem.deployContract("PrincipalToken", [
      "PT Treasury Dec2027",
      "PT-TREASURY",
      maturity,
      nusd.address,
      admin,
    ]);

    // --- Predict splitter address so YT can reference it ---
    // Admin nonce after all txs above. Next deploy = YT, then splitter.
    const currentNonce = await publicClient.getTransactionCount({ address: admin });
    const predictedSplitterAddr = getContractAddress({
      from: admin,
      nonce: BigInt(currentNonce) + 1n,
    });

    // --- Deploy YieldToken with predicted splitter address ---
    yt = await viem.deployContract("YieldToken", [
      "YT Treasury Dec2027",
      "YT-TREASURY",
      maturity,
      predictedSplitterAddr,
      nusd.address,
      admin,
    ]);

    // --- Deploy YieldSplitter ---
    splitter = await viem.deployContract("YieldSplitter", [
      vault.address,
      pt.address,
      yt.address,
      maturity,
      admin,
    ]);

    assert.equal(
      splitter.address.toLowerCase(),
      predictedSplitterAddr.toLowerCase(),
      "Splitter address prediction must match"
    );

    // Grant MINTER_ROLE on PT and YT to the splitter
    await pt.write.grantRole([MINTER_ROLE, splitter.address]);
    await yt.write.grantRole([MINTER_ROLE, splitter.address]);

    // Mint NUSD to users for testing
    await nusd.write.mint([user, NUSD(100_000)]);
    await nusd.write.mint([user2, NUSD(100_000)]);
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async function depositToVault(account: `0x${string}`, amount: bigint, client: any) {
    await nusd.write.approve([vault.address, amount], { account: client.account });
    await vault.write.deposit([amount, account], { account: client.account });
    return await vault.read.balanceOf([account]);
  }

  async function splitShares(account: `0x${string}`, vaultShares: bigint, client: any) {
    // Approve splitter to take vault shares (vault IS an ERC20)
    await vault.write.approve([splitter.address, vaultShares], { account: client.account });
    await splitter.write.split([vaultShares], { account: client.account });
  }

  // -------------------------------------------------------------------------
  // Tests: split
  // -------------------------------------------------------------------------

  describe("split", () => {
    it("splits vault shares into PT + YT 1:1 in asset terms", async () => {
      const depositAmount = NUSD(10_000);
      const shares = await depositToVault(user, depositAmount, userClient);

      await splitShares(user, shares, userClient);

      const ptBal = await pt.read.balanceOf([user]);
      const ytBal = await yt.read.balanceOf([user]);

      // At inception (no oracle NAV posted), 1 share = 1 NUSD asset
      // Vault shares have 18 decimals, assets have 6 decimals
      // convertToAssets(shares) should give us the deposit amount
      assert.equal(ptBal, depositAmount, "PT balance should match deposit in asset terms");
      assert.equal(ytBal, depositAmount, "YT balance should match deposit in asset terms");
    });

    it("transfers vault shares to the splitter", async () => {
      const splitterShares = await vault.read.balanceOf([splitter.address]);
      assert.ok(splitterShares > 0n, "splitter should hold vault shares after split");
    });

    it("user has zero vault shares after split", async () => {
      const userShares = await vault.read.balanceOf([user]);
      assert.equal(userShares, 0n, "user should have no vault shares after splitting all");
    });

    it("reverts on zero amount", async () => {
      await assert.rejects(
        async () => splitter.write.split([0n], { account: userClient.account }),
        /revert|ZeroAmount/i,
      );
    });

    it("allows multiple users to split", async () => {
      const depositAmount = NUSD(5_000);
      const shares = await depositToVault(user2, depositAmount, user2Client);
      await splitShares(user2, shares, user2Client);

      const ptBal = await pt.read.balanceOf([user2]);
      const ytBal = await yt.read.balanceOf([user2]);
      assert.equal(ptBal, depositAmount, "user2 PT balance correct");
      assert.equal(ytBal, depositAmount, "user2 YT balance correct");
    });
  });

  // -------------------------------------------------------------------------
  // Tests: unsplit (early exit)
  // -------------------------------------------------------------------------

  describe("unsplit", () => {
    it("burns PT + YT and returns vault shares", async () => {
      const ptBal = await pt.read.balanceOf([user2]);
      assert.ok(ptBal > 0n, "user2 should have PT to unsplit");

      await splitter.write.unsplit([ptBal], { account: user2Client.account });

      const ptAfter = await pt.read.balanceOf([user2]);
      const ytAfter = await yt.read.balanceOf([user2]);
      const sharesAfter = await vault.read.balanceOf([user2]);

      assert.equal(ptAfter, 0n, "PT should be zero after unsplit");
      assert.equal(ytAfter, 0n, "YT should be zero after unsplit");
      assert.ok(sharesAfter > 0n, "user2 should have vault shares back");
    });

    it("reverts on zero amount", async () => {
      await assert.rejects(
        async () => splitter.write.unsplit([0n], { account: userClient.account }),
        /revert|ZeroAmount/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tests: yield accrual and distribution
  // -------------------------------------------------------------------------

  describe("yield distribution", () => {
    it("pendingYield returns 0 when NAV has not changed", async () => {
      const pending = await splitter.read.pendingYield();
      assert.equal(pending, 0n, "no pending yield when NAV unchanged");
    });

    it("pendingYield reflects vault NAV increase", async () => {
      // Post a higher NAV to simulate yield (5% increase)
      // Current totalAssets in vault = whatever is deposited
      const vaultTotalAssets = await vault.read.totalAssets();
      const newNAV = vaultTotalAssets + (vaultTotalAssets * 5n / 100n);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await oracle.write.postNAV([newNAV, ts]);

      const pending = await splitter.read.pendingYield();
      assert.ok(pending > 0n, "should have pending yield after NAV increase");
    });

    it("distributeYield withdraws yield from vault to YT contract", async () => {
      const ytNusdBefore = await nusd.read.balanceOf([yt.address]);

      await splitter.write.distributeYield();

      const ytNusdAfter = await nusd.read.balanceOf([yt.address]);
      assert.ok(
        ytNusdAfter > ytNusdBefore,
        "YT contract should receive underlying tokens from yield distribution"
      );
    });

    it("pendingYield is 0 after distribution", async () => {
      const pending = await splitter.read.pendingYield();
      assert.equal(pending, 0n, "pending yield should be 0 after distribution");
    });
  });

  // -------------------------------------------------------------------------
  // Tests: maturity and redemption
  // -------------------------------------------------------------------------

  describe("maturity redemption", () => {
    it("redeemPT reverts before maturity", async () => {
      await assert.rejects(
        async () => splitter.write.redeemPT([NUSD(100)], { account: userClient.account }),
        /revert|MaturityNotReached/i,
      );
    });

    it("redeemYT reverts before maturity", async () => {
      await assert.rejects(
        async () => splitter.write.redeemYT([NUSD(100)], { account: userClient.account }),
        /revert|MaturityNotReached/i,
      );
    });

    it("split reverts after maturity", async () => {
      // Advance time past maturity
      const testClient = await viem.getTestClient();
      await testClient.increaseTime({ seconds: Number(366n * 24n * 60n * 60n) });
      await testClient.mine({ blocks: 1 });

      // Deposit some NUSD to get vault shares, then try split
      const depositAmount = NUSD(1_000);
      await nusd.write.mint([user2, depositAmount]);
      const shares = await depositToVault(user2, depositAmount, user2Client);

      await assert.rejects(
        async () => splitShares(user2, shares, user2Client),
        /revert|AlreadyMatured/i,
      );
    });

    it("unsplit reverts after maturity", async () => {
      await assert.rejects(
        async () => splitter.write.unsplit([NUSD(100)], { account: userClient.account }),
        /revert|AlreadyMatured/i,
      );
    });

    it("redeemPT returns underlying after maturity (pro-rata of available assets)", async () => {
      const ptBal = await pt.read.balanceOf([user]);
      assert.ok(ptBal > 0n, "user should have PT to redeem");

      const nusdBefore = await nusd.read.balanceOf([user]);

      await splitter.write.redeemPT([ptBal], { account: userClient.account });

      const ptAfter = await pt.read.balanceOf([user]);
      const nusdAfter = await nusd.read.balanceOf([user]);

      assert.equal(ptAfter, 0n, "PT should be zero after redemption");

      const received = nusdAfter - nusdBefore;
      // PT holders get their pro-rata share of available assets.
      // Some yield was already distributed to YT, so PT payout is less than 1:1.
      // But it should still be substantial (>90% of face value since only 5% yield was posted).
      assert.ok(received > 0n, "should receive some NUSD");
      assert.ok(received > ptBal * 90n / 100n, `PT payout should be >90% of face. Got ${received}, face ${ptBal}`);
    });

    it("redeemYT returns remaining yield after maturity", async () => {
      const ytBal = await yt.read.balanceOf([user]);

      if (ytBal === 0n) {
        assert.ok(true, "no YT to redeem");
        return;
      }

      const nusdBefore = await nusd.read.balanceOf([user]);
      await splitter.write.redeemYT([ytBal], { account: userClient.account });
      const nusdAfter = await nusd.read.balanceOf([user]);

      assert.equal(await yt.read.balanceOf([user]), 0n, "YT should be zero after redemption");
      assert.ok(nusdAfter >= nusdBefore, "user should not lose NUSD from YT redemption");
    });

    it("redeemPT reverts with zero amount", async () => {
      await assert.rejects(
        async () => splitter.write.redeemPT([0n], { account: userClient.account }),
        /revert|ZeroAmount/i,
      );
    });

    it("redeemYT reverts with zero amount", async () => {
      await assert.rejects(
        async () => splitter.write.redeemYT([0n], { account: userClient.account }),
        /revert|ZeroAmount/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tests: access control
  // -------------------------------------------------------------------------

  describe("access control", () => {
    it("only MINTER_ROLE can mint PT", async () => {
      await assert.rejects(
        async () => pt.write.mint([user2, NUSD(100)], { account: user2Client.account }),
        /revert|AccessControl/i,
      );
    });

    it("only MINTER_ROLE can mint YT", async () => {
      await assert.rejects(
        async () => yt.write.mint([user2, NUSD(100)], { account: user2Client.account }),
        /revert|AccessControl/i,
      );
    });

    it("only splitter can call YT.addYield", async () => {
      await assert.rejects(
        async () => yt.write.addYield([user2, NUSD(100)], { account: user2Client.account }),
        /revert|OnlySplitter/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tests: view functions
  // -------------------------------------------------------------------------

  describe("view functions", () => {
    it("PT has correct maturity", async () => {
      const ptMaturity = await pt.read.maturity();
      assert.equal(ptMaturity, maturity);
    });

    it("YT has correct maturity", async () => {
      const ytMaturity = await yt.read.maturity();
      assert.equal(ytMaturity, maturity);
    });

    it("PT has 6 decimals", async () => {
      assert.equal(await pt.read.decimals(), 6);
    });

    it("YT has 6 decimals", async () => {
      assert.equal(await yt.read.decimals(), 6);
    });
  });
});
