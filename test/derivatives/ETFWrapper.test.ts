// test/derivatives/ETFWrapper.test.ts
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, parseUnits } from "viem";

const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));
const MINTER_ROLE   = keccak256(toBytes("MINTER_ROLE"));

const NUSD = (n: number) => parseUnits(String(n), 6);

describe("ETFWrapper", () => {
  let viem: any;
  let publicClient: any;
  let admin: `0x${string}`;
  let user: `0x${string}`;
  let user2: `0x${string}`;
  let adminClient: any;
  let userClient: any;
  let user2Client: any;
  let nusd: any;
  let oracle1: any;
  let oracle2: any;
  let vault1: any;
  let vault2: any;
  let etf: any;

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

    // --- Deploy NUSD ---
    const impl = await viem.deployContract("NexusStableCoin", []);
    const initData = encodeFunctionData({
      abi: impl.abi,
      functionName: "initialize",
      args: ["Nexus USD", "NUSD", admin],
    });
    const proxy = await viem.deployContract("ERC1967Proxy", [impl.address, initData]);
    nusd = await viem.getContractAt("NexusStableCoin", proxy.address);
    await nusd.write.grantRole([MINTER_ROLE, admin]);

    // --- Deploy two NAVOracles + two YieldVaults ---
    oracle1 = await viem.deployContract("NAVOracle", [admin]);
    await oracle1.write.grantRole([REPORTER_ROLE, admin]);
    oracle2 = await viem.deployContract("NAVOracle", [admin]);
    await oracle2.write.grantRole([REPORTER_ROLE, admin]);

    vault1 = await viem.deployContract("YieldVault", [
      nusd.address, oracle1.address, "Treasury Vault", "nxTREASURY",
    ]);
    vault2 = await viem.deployContract("YieldVault", [
      nusd.address, oracle2.address, "Money Market Vault", "nxMM",
    ]);

    // --- Deploy ETFWrapper with 60/40 split ---
    etf = await viem.deployContract("ETFWrapper", [
      nusd.address,
      [vault1.address, vault2.address],
      [6000n, 4000n],     // 60% vault1, 40% vault2
      "Nexus Balanced ETF",
      "nxETF",
      admin,
    ]);

    // Mint NUSD to users
    await nusd.write.mint([user, NUSD(100_000)]);
    await nusd.write.mint([user2, NUSD(100_000)]);
  });

  // --- Deposit ---

  it("should deposit and mint ETF tokens", async () => {
    const nusdUser = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: userClient } });
    await nusdUser.write.approve([etf.address, NUSD(10_000)]);
    const etfUser = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: userClient } });
    await etfUser.write.deposit([NUSD(10_000)]);

    const balance = await etf.read.balanceOf([user]);
    assert.equal(balance, NUSD(10_000)); // first deposit = 1:1
  });

  it("should split NUSD across vaults per weight", async () => {
    // vault1 should have 60% of 10k = 6k NUSD
    const v1Assets = await vault1.read.totalAssets();
    const v2Assets = await vault2.read.totalAssets();
    assert.equal(v1Assets, NUSD(6_000));
    assert.equal(v2Assets, NUSD(4_000));
  });

  it("should return correct totalNAV", async () => {
    const nav = await etf.read.totalNAV();
    assert.equal(nav, NUSD(10_000));
  });

  it("should return correct pricePerToken", async () => {
    const price = await etf.read.pricePerToken();
    assert.equal(price, 1_000_000n); // $1.00 in 6 decimals
  });

  it("should revert deposit with zero", async () => {
    const etfUser = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: userClient } });
    await assert.rejects(etfUser.write.deposit([0n]), /ZeroAmount/);
  });

  // --- Multiple Depositors ---

  it("should handle second depositor correctly", async () => {
    const nusdUser2 = await viem.getContractAt("NexusStableCoin", nusd.address, { client: { wallet: user2Client } });
    await nusdUser2.write.approve([etf.address, NUSD(10_000)]);
    const etfUser2 = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: user2Client } });
    await etfUser2.write.deposit([NUSD(10_000)]);

    const balance2 = await etf.read.balanceOf([user2]);
    // NAV was 10k, supply was 10k. 10k deposit → 10k tokens
    assert.equal(balance2, NUSD(10_000));

    const totalSupply = await etf.read.totalSupply();
    assert.equal(totalSupply, NUSD(20_000));
  });

  // --- Withdraw ---

  it("should withdraw and burn ETF tokens", async () => {
    const etfUser = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: userClient } });
    const balBefore = await nusd.read.balanceOf([user]);

    await etfUser.write.withdraw([NUSD(5_000)]);

    const balAfter = await nusd.read.balanceOf([user]);
    const received = balAfter - balBefore;
    // Should get approximately 5000 NUSD back
    assert.ok(received >= NUSD(4_999));
    assert.ok(received <= NUSD(5_001));
  });

  it("should revert withdraw with zero", async () => {
    const etfUser = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: userClient } });
    await assert.rejects(etfUser.write.withdraw([0n]), /ZeroAmount/);
  });

  it("should revert withdraw exceeding balance", async () => {
    const etfUser = await viem.getContractAt("ETFWrapper", etf.address, { client: { wallet: userClient } });
    await assert.rejects(etfUser.write.withdraw([NUSD(999_999)]), /ERC20InsufficientBalance/);
  });

  // --- NAV Changes ---

  it("should reflect NAV increase in pricePerToken", async () => {
    // Post higher NAV on vault1 → total NAV goes up → price per token increases
    const block = await publicClient.getBlock();
    // vault1 had 12k (6k + 6k from second deposit), increase to 15k
    await oracle1.write.postNAV([NUSD(15_000), block.timestamp + 1n]);

    const price = await etf.read.pricePerToken();
    // NAV increased: vault1 reports 15k, vault2 has ~8k → total ~23k
    // Supply is 15k (20k - 5k withdrawn)
    // price = (23k * 1e6) / 15k ≈ 1.533e6
    assert.ok(price > 1_000_000n); // price > $1
  });

  // --- View Functions ---

  it("should return correct allocation count", async () => {
    const count = await etf.read.allocationCount();
    assert.equal(count, 2n);
  });

  it("should return 6 decimals", async () => {
    const dec = await etf.read.decimals();
    assert.equal(dec, 6);
  });

  // --- Constructor Validation ---

  it("should revert with mismatched vault/weight arrays", async () => {
    await assert.rejects(
      viem.deployContract("ETFWrapper", [
        nusd.address,
        [vault1.address],
        [5000n, 5000n],
        "Bad ETF", "BAD", admin,
      ]),
      /InvalidWeights/,
    );
  });

  it("should revert with weights not summing to 10000", async () => {
    await assert.rejects(
      viem.deployContract("ETFWrapper", [
        nusd.address,
        [vault1.address, vault2.address],
        [5000n, 4000n],  // = 9000 not 10000
        "Bad ETF", "BAD", admin,
      ]),
      /InvalidWeights/,
    );
  });

  it("should revert with empty allocations", async () => {
    await assert.rejects(
      viem.deployContract("ETFWrapper", [
        nusd.address, [], [], "Bad ETF", "BAD", admin,
      ]),
      /NoAllocations/,
    );
  });
});
