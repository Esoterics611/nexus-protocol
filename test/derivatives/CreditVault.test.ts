// test/derivatives/CreditVault.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));
const MINTER_ROLE   = keccak256(toBytes("MINTER_ROLE"));

const NUSD = (n: number) => parseUnits(String(n), 6);

describe("CreditVault", () => {
  let viem: any;
  let publicClient: any;
  let admin: `0x${string}`;
  let borrower: `0x${string}`;
  let liquidator: `0x${string}`;
  let adminClient: any;
  let borrowerClient: any;
  let liquidatorClient: any;
  let nusd: any;
  let oracle: any;
  let vault: any;
  let creditVault: any;

  // Helper: mint NUSD to an address via admin
  async function mintNUSD(to: `0x${string}`, amount: bigint) {
    await nusd.write.mint([to, amount]);
  }

  // Helper: deposit into vault and get shares
  async function depositToVault(client: any, user: `0x${string}`, amount: bigint) {
    // Approve vault
    const nusdUser = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: client } });
    await nusdUser.write.approve([vault.address, amount]);
    const vaultUser = await viem.getContractAt("YieldVault", vault.address, { client: { wallet: client } });
    await vaultUser.write.deposit([amount, user]);
  }

  // Helper: get contract with a specific signer
  async function getCreditVault(client: any) {
    return viem.getContractAt("CreditVault", creditVault.address, { client: { wallet: client } });
  }

  before(async () => {
    const connection = await hre.network.connect();
    viem = connection.viem;

    const wallets = await viem.getWalletClients();
    adminClient      = wallets[0];
    borrowerClient   = wallets[1];
    liquidatorClient = wallets[2];
    admin      = adminClient.account.address;
    borrower   = borrowerClient.account.address;
    liquidator = liquidatorClient.account.address;
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

    // Grant MINTER_ROLE to admin for test convenience
    await nusd.write.grantRole([MINTER_ROLE, admin]);

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

    // --- Deploy CreditVault ---
    // 150% collateral ratio, 120% liquidation, 5% borrow rate, 5% liquidation discount
    creditVault = await viem.deployContract("CreditVault", [
      vault.address,
      nusd.address,
      15000n,   // collateralRatioBps
      12000n,   // liquidationRatioBps
      500n,     // borrowRateBps (5%)
      500n,     // liquidationDiscountBps (5%)
      admin,
    ]);

    // Fund CreditVault with NUSD liquidity
    await mintNUSD(admin, NUSD(1_000_000));
    await nusd.write.approve([creditVault.address, NUSD(1_000_000)]);
    await creditVault.write.fundLiquidity([NUSD(1_000_000)]);

    // Give borrower NUSD and vault shares
    await mintNUSD(borrower, NUSD(100_000));
    const nusdBorrower = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: borrowerClient } });
    await nusdBorrower.write.approve([vault.address, NUSD(100_000)]);
    const vaultBorrower = await viem.getContractAt("YieldVault", vault.address, { client: { wallet: borrowerClient } });
    await vaultBorrower.write.deposit([NUSD(100_000), borrower]);

    // Give liquidator NUSD
    await mintNUSD(liquidator, NUSD(500_000));
  });

  // --- Deposit Collateral ---

  it("should deposit collateral", async () => {
    const cv = await getCreditVault(borrowerClient);
    const vaultBorrower = await viem.getContractAt("YieldVault", vault.address, { client: { wallet: borrowerClient } });
    const sharesBefore = await vault.read.balanceOf([borrower]);

    // Approve CreditVault to take vault shares
    await vaultBorrower.write.approve([creditVault.address, sharesBefore]);
    await cv.write.depositCollateral([sharesBefore]);

    const pos = await creditVault.read.positions([borrower]);
    assert.equal(pos[0], sharesBefore); // collateralShares
    assert.equal(pos[1], 0n);           // debtNUSD
  });

  it("should revert depositCollateral with zero", async () => {
    const cv = await getCreditVault(borrowerClient);
    await assert.rejects(cv.write.depositCollateral([0n]), /ZeroAmount/);
  });

  // --- Borrow ---

  it("should borrow NUSD within collateral ratio", async () => {
    const cv = await getCreditVault(borrowerClient);
    // Collateral = 100,000 NUSD worth of shares, 150% ratio → max borrow ~66,666
    await cv.write.borrow([NUSD(50_000)]);

    const pos = await creditVault.read.positions([borrower]);
    assert.equal(pos[1], NUSD(50_000)); // debtNUSD

    const borrowerBal = await nusd.read.balanceOf([borrower]);
    assert.equal(borrowerBal, NUSD(50_000));
  });

  it("should revert borrow if undercollateralized", async () => {
    const cv = await getCreditVault(borrowerClient);
    // Already have 50k debt, 100k collateral at 150% ratio → max ~66.6k
    // Trying to borrow another 20k would put us over
    await assert.rejects(cv.write.borrow([NUSD(20_000)]), /Undercollateralized/);
  });

  it("should revert borrow with zero amount", async () => {
    const cv = await getCreditVault(borrowerClient);
    await assert.rejects(cv.write.borrow([0n]), /ZeroAmount/);
  });

  // --- Repay ---

  it("should repay partial debt", async () => {
    const cv = await getCreditVault(borrowerClient);
    const nusdBorrower = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: borrowerClient } });
    await nusdBorrower.write.approve([creditVault.address, NUSD(20_000)]);
    await cv.write.repay([NUSD(20_000)]);

    const pos = await creditVault.read.positions([borrower]);
    // Debt should be approximately 30,000 (50k - 20k, plus tiny interest)
    assert.ok(pos[1] >= NUSD(30_000));
    assert.ok(pos[1] < NUSD(30_100)); // small interest margin
  });

  it("should repay full remaining debt", async () => {
    const cv = await getCreditVault(borrowerClient);
    const nusdBorrower = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: borrowerClient } });

    // Get current debt (includes accrued interest)
    const debt = await creditVault.read.currentDebt([borrower]);

    // Mint enough to cover debt + a buffer for interest accrued during this tx
    const buffer = debt / 100n + 1000n; // small buffer
    await mintNUSD(borrower, debt + buffer);
    await nusdBorrower.write.approve([creditVault.address, debt + buffer]);

    // Read on-chain debt after accrual (the repay call will accrue first)
    // We need to repay the exact amount the contract thinks is owed after accrual
    // Simplest: repay a large amount but not more than debt
    // Actually, let's just read and repay the currentDebt which is a view
    await cv.write.repay([debt]);

    // There may be a tiny residual from interest accrual between read and write
    const pos = await creditVault.read.positions([borrower]);
    // Allow tiny residual from interest accrued between our view call and the tx
    assert.ok(pos[1] < 1000n, `residual debt ${pos[1]} should be negligible`);
  });

  it("should revert repay exceeding debt", async () => {
    // First borrow again to have some debt
    const cv = await getCreditVault(borrowerClient);
    await cv.write.borrow([NUSD(10_000)]);

    const nusdBorrower = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: borrowerClient } });
    await nusdBorrower.write.approve([creditVault.address, NUSD(999_999)]);
    await assert.rejects(cv.write.repay([NUSD(999_999)]), /RepayExceedsDebt/);
  });

  it("should revert repay with zero", async () => {
    const cv = await getCreditVault(borrowerClient);
    await assert.rejects(cv.write.repay([0n]), /ZeroAmount/);
  });

  // --- Withdraw Collateral ---

  it("should withdraw collateral if still collateralized", async () => {
    // Repay remaining debt first so we can withdraw
    const cv = await getCreditVault(borrowerClient);
    const debt = await creditVault.read.currentDebt([borrower]);
    if (debt > 0n) {
      const nusdBorrower = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: borrowerClient } });
      await mintNUSD(borrower, debt);
      await nusdBorrower.write.approve([creditVault.address, debt]);
      await cv.write.repay([debt]);
    }

    // Withdraw some collateral
    const pos = await creditVault.read.positions([borrower]);
    const sharesToWithdraw = pos[0] / 2n;
    await cv.write.withdrawCollateral([sharesToWithdraw]);

    const posAfter = await creditVault.read.positions([borrower]);
    assert.equal(posAfter[0], pos[0] - sharesToWithdraw);
  });

  it("should revert withdrawCollateral if it makes position undercollateralized", async () => {
    // Borrow against remaining collateral
    const cv = await getCreditVault(borrowerClient);
    const pos = await creditVault.read.positions([borrower]);
    const colValue = await creditVault.read.collateralValue([borrower]);
    // Borrow up to ~60% of collateral value
    const borrowAmt = (colValue * 60n) / 100n;
    if (borrowAmt > 0n) {
      await cv.write.borrow([borrowAmt]);
      // Now try to withdraw all collateral — should fail
      await assert.rejects(cv.write.withdrawCollateral([pos[0]]), /Undercollateralized/);
    }
  });

  it("should revert withdrawCollateral with zero", async () => {
    const cv = await getCreditVault(borrowerClient);
    await assert.rejects(cv.write.withdrawCollateral([0n]), /ZeroAmount/);
  });

  // --- LTV and View Functions ---

  it("should return correct LTV ratio", async () => {
    const ltv = await creditVault.read.ltvRatio([borrower]);
    // Should be around 6000 bps (60%) since we borrowed 60% of collateral value
    assert.ok(ltv > 0n);
    assert.ok(ltv <= 10000n); // must be under 100%
  });

  it("should return available liquidity", async () => {
    const liq = await creditVault.read.availableLiquidity();
    assert.ok(liq > 0n);
  });

  // --- Liquidation ---

  it("should revert liquidation on healthy position", async () => {
    const cvLiq = await getCreditVault(liquidatorClient);
    await assert.rejects(cvLiq.write.liquidate([borrower]), /NotLiquidatable/);
  });

  it("should liquidate undercollateralized position after NAV drop", async () => {
    // Deploy a fresh, isolated CreditVault + Vault + Oracle for this test
    const freshOracle = await viem.deployContract("NAVOracle", [admin]);
    await freshOracle.write.grantRole([REPORTER_ROLE, admin]);

    const freshVault = await viem.deployContract("YieldVault", [
      nusd.address, freshOracle.address, "Liq Test Vault", "nxLIQ",
    ]);

    const freshCV = await viem.deployContract("CreditVault", [
      freshVault.address, nusd.address,
      15000n, 12000n, 500n, 500n, admin,
    ]);

    // Fund CreditVault liquidity
    await mintNUSD(admin, NUSD(100_000));
    await nusd.write.approve([freshCV.address, NUSD(100_000)]);
    await freshCV.write.fundLiquidity([NUSD(100_000)]);

    // Use admin as the test borrower for simplicity (admin has MINTER_ROLE)
    await mintNUSD(admin, NUSD(10_000));
    await nusd.write.approve([freshVault.address, NUSD(10_000)]);
    const adminFV = await viem.getContractAt("YieldVault", freshVault.address);
    await adminFV.write.deposit([NUSD(10_000), admin]);

    const shares = await freshVault.read.balanceOf([admin]);
    assert.ok(shares > 0n, `should have shares: ${shares}`);

    await adminFV.write.approve([freshCV.address, shares]);
    const adminCV = await viem.getContractAt("CreditVault", freshCV.address);
    await adminCV.write.depositCollateral([shares]);

    const posAfterDeposit = await freshCV.read.positions([admin]);
    assert.ok(posAfterDeposit[0] > 0n, `should have collateral: ${posAfterDeposit[0]}`);

    // Borrow 6,600 (near max of 10k/1.5 ≈ 6,666)
    await adminCV.write.borrow([NUSD(6_600)]);

    const posBefore = await freshCV.read.positions([admin]);
    assert.ok(posBefore[1] > 0n, `should have debt: ${posBefore[1]}`);

    // Drop NAV to make collateral worth less than 120% of debt
    const block = await publicClient.getBlock();
    await freshOracle.write.postNAV([NUSD(5_000), block.timestamp + 1n]);

    // Verify position is undercollateralized
    const ltv = await freshCV.read.ltvRatio([admin]);
    assert.ok(ltv > 12000n, `LTV ${ltv} should exceed 12000`);

    // Liquidator liquidates
    const cvLiq = await viem.getContractAt("CreditVault", freshCV.address, { client: { wallet: liquidatorClient } });
    const nusdLiq = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: liquidatorClient } });
    const debtToRepay = await freshCV.read.currentDebt([admin]);
    // Mint with buffer: liquidate() accrues interest internally so actual debt > view result
    await mintNUSD(liquidator, debtToRepay + NUSD(1_000));
    // Max approval so any interest accrued between read and tx is covered
    await nusdLiq.write.approve([freshCV.address, 2n**256n - 1n]);
    await cvLiq.write.liquidate([admin]);

    // Position should be cleared
    const posAfter = await freshCV.read.positions([admin]);
    assert.equal(posAfter[0], 0n);
    assert.equal(posAfter[1], 0n);
  });

  it("should revert liquidation when no debt", async () => {
    // Use an address with no position at all
    const connection = await hre.network.connect();
    const wallets = await connection.viem.getWalletClients();
    const noDebtAddr = wallets[4].account.address as `0x${string}`;
    const cvLiq = await getCreditVault(liquidatorClient);
    await assert.rejects(cvLiq.write.liquidate([noDebtAddr]), /NoDebt/);
  });

  // --- Interest Accrual ---

  it("should accrue interest over time", async () => {
    // Use an isolated vault + oracle + creditVault for clean interest test
    const intOracle = await viem.deployContract("NAVOracle", [admin]);
    await intOracle.write.grantRole([REPORTER_ROLE, admin]);

    const intVault = await viem.deployContract("YieldVault", [
      nusd.address, intOracle.address, "Interest Test Vault", "nxINT",
    ]);

    const intCV = await viem.deployContract("CreditVault", [
      intVault.address, nusd.address,
      15000n, 12000n, 500n, 500n, admin,
    ]);

    // Fund liquidity
    await mintNUSD(admin, NUSD(100_000));
    await nusd.write.approve([intCV.address, NUSD(100_000)]);
    await intCV.write.fundLiquidity([NUSD(100_000)]);

    // Borrower setup — use the same viem connection from before()
    const wallets = await viem.getWalletClients();
    const intBorrower = wallets[5];
    const intAddr = intBorrower.account.address as `0x${string}`;

    await mintNUSD(intAddr, NUSD(10_000));
    const nusdInt = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: intBorrower } });
    // Max approval: covers vault deposit regardless of rounding
    await nusdInt.write.approve([intVault.address, 2n**256n - 1n]);
    const ivInt = await viem.getContractAt("YieldVault", intVault.address, { client: { wallet: intBorrower } });
    await ivInt.write.deposit([NUSD(10_000), intAddr]);

    const shares = await intVault.read.balanceOf([intAddr]);
    // Max approval: covers depositCollateral regardless of share rounding
    await ivInt.write.approve([intCV.address, 2n**256n - 1n]);
    const cvInt = await viem.getContractAt("CreditVault", intCV.address, { client: { wallet: intBorrower } });
    await cvInt.write.depositCollateral([shares]);
    await cvInt.write.borrow([NUSD(3_000)]);

    const debtBefore = await intCV.read.currentDebt([intAddr]);

    // Advance time by exactly 365 days using an absolute timestamp.
    // evm_increaseTime is cumulative across test files (YieldSplitter advances 366 days),
    // so we use testClient.setNextBlockTimestamp to pin the elapsed time precisely.
    const testClientInt = await viem.getTestClient();
    const curBlock = await publicClient.getBlock();
    const targetTs = curBlock.timestamp + BigInt(365 * 24 * 3600);
    await testClientInt.setNextBlockTimestamp({ timestamp: targetTs });
    await testClientInt.mine({ blocks: 1 });

    const debtAfter = await intCV.read.currentDebt([intAddr]);
    // 5% APR on 3000 = 150 NUSD interest
    assert.ok(debtAfter > debtBefore);
    const interest = debtAfter - debtBefore;
    assert.ok(interest >= NUSD(149), `interest ${interest} should be >= 149 NUSD`);
    assert.ok(interest <= NUSD(151), `interest ${interest} should be <= 151 NUSD`);
  });

  // --- Fund Liquidity ---

  it("should revert fundLiquidity with zero", async () => {
    await assert.rejects(creditVault.write.fundLiquidity([0n]), /ZeroAmount/);
  });
});
