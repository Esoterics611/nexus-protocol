/**
 * Scenario 10: Bulk Data Generation — @data
 *
 * NOT a pass/fail correctness test.
 * Generates realistic on-chain activity for demos and indexer testing.
 *
 * Runs:
 *   - 8 deposits across investor-a, investor-b, investor-c, whale
 *   - 4 withdrawals
 *   - 2 NAV updates
 *   - 2 reserve updates
 *
 * All tx hashes are logged for reference.
 * Errors are caught and logged — the suite continues even on individual failures.
 *
 * Run: npm run test:data
 * Expected runtime: 5-10 minutes (real testnet txs)
 */

import { test } from '@playwright/test';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import {
  wallets,
  CONTRACTS,
  RPC_URL,
  getWallet,
} from '../wallets/index.js';
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../test-results');
const LOG_FILE = resolve(LOG_DIR, 'data-generation.log');

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
writeFileSync(LOG_FILE, `Data generation run: ${new Date().toISOString()}\n\n`);

function log(msg: string) {
  console.log(msg);
  appendFileSync(LOG_FILE, msg + '\n');
}

// ── Viem setup ────────────────────────────────────────────────────────────────

const transport = http(RPC_URL);
const rpc = createPublicClient({ chain: baseSepolia, transport });

function walletClient(walletIndex: number) {
  const account = privateKeyToAccount(wallets[walletIndex].privateKey);
  return { account, client: createWalletClient({ account, chain: baseSepolia, transport }) };
}

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);

const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function previewWithdraw(uint256) view returns (uint256)',
]);

const NAV_ORACLE_ABI = parseAbi([
  // postNAV takes TWO args: totalAssets + timestamp (unix seconds)
  'function postNAV(uint256 totalAssets, uint256 timestamp) external',
]);

const RESERVE_ABI = parseAbi([
  'function postReserve(string assetType, uint256 amount) external',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendTx(
  label: string,
  fn: () => Promise<Hash>,
): Promise<Hash | null> {
  try {
    const hash = await fn();
    await rpc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    log(`  ✅ ${label}: ${hash}`);
    return hash;
  } catch (err: any) {
    log(`  ❌ ${label}: ${err.shortMessage || err.message}`);
    return null;
  }
}

async function deposit(walletIndex: number, amountNUSD: bigint): Promise<void> {
  const { account, client } = walletClient(walletIndex);
  const role = wallets[walletIndex].role;
  const amount6dec = amountNUSD * 1_000_000n;

  // Check balance
  const balance = await rpc.readContract({
    address: CONTRACTS.stablecoin, abi: ERC20_ABI,
    functionName: 'balanceOf', args: [account.address],
  });
  if (balance < amount6dec) {
    log(`  ⚠️  wallet[${walletIndex}] ${role}: insufficient balance (${Number(balance)/1e6} NUSD), skipping`);
    return;
  }

  // Approve
  await sendTx(`approve ${amountNUSD} NUSD [wallet${walletIndex}/${role}]`, () =>
    client.writeContract({
      address: CONTRACTS.stablecoin, abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACTS.yieldVault, amount6dec],
    })
  );

  // Deposit
  await sendTx(`deposit ${amountNUSD} NUSD [wallet${walletIndex}/${role}]`, () =>
    client.writeContract({
      address: CONTRACTS.yieldVault, abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amount6dec, account.address],
    })
  );
}

async function withdraw(walletIndex: number, amountNUSD: bigint): Promise<void> {
  const { account, client } = walletClient(walletIndex);
  const role = wallets[walletIndex].role;
  const amount6dec = amountNUSD * 1_000_000n;

  // Check shares
  const shares = await rpc.readContract({
    address: CONTRACTS.yieldVault, abi: VAULT_ABI,
    functionName: 'balanceOf', args: [account.address],
  });
  if (shares === 0n) {
    log(`  ⚠️  wallet[${walletIndex}] ${role}: no shares to withdraw, skipping`);
    return;
  }

  await sendTx(`withdraw ${amountNUSD} NUSD [wallet${walletIndex}/${role}]`, () =>
    client.writeContract({
      address: CONTRACTS.yieldVault, abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [amount6dec, account.address, account.address],
    })
  );
}

async function postNAV(walletIndex: number, totalAssetsNUSD: bigint): Promise<void> {
  const { client } = walletClient(walletIndex);
  const role = wallets[walletIndex].role;
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  await sendTx(`postNAV $${totalAssetsNUSD}M NUSD [wallet${walletIndex}/${role}]`, () =>
    client.writeContract({
      address: CONTRACTS.navOracle, abi: NAV_ORACLE_ABI,
      functionName: 'postNAV',
      // totalAssets in 6-decimal NUSD (millions * 1e12 = millions * 1e6 decimals)
      // timestamp = current unix seconds
      args: [totalAssetsNUSD * 1_000_000_000_000n, timestamp],
    })
  );
}

async function postReserve(walletIndex: number, assetType: string, amountNUSD: bigint): Promise<void> {
  const { client } = walletClient(walletIndex);
  const role = wallets[walletIndex].role;
  await sendTx(`postReserve ${assetType} $${amountNUSD}M [wallet${walletIndex}/${role}]`, () =>
    client.writeContract({
      address: CONTRACTS.reserveTracker, abi: RESERVE_ABI,
      functionName: 'postReserve',
      args: [assetType, amountNUSD * 1_000_000_000_000n],
    })
  );
}

// ── Test: bulk data generation ────────────────────────────────────────────────

test.describe('Bulk Data Generation @data', () => {
  test.setTimeout(600_000); // 10 min

  test('generate realistic on-chain activity', async () => {
    log('═══════════════════════════════════════════');
    log('  NEXUS PROTOCOL — BULK DATA GENERATION');
    log(`  Started: ${new Date().toISOString()}`);
    log('═══════════════════════════════════════════\n');

    // ── Round 1: Initial deposits ──────────────────────────────────────────
    log('📋  Round 1: Initial deposits');
    await deposit(2, 200n);  // investor-a: 200 NUSD
    await deposit(3, 150n);  // investor-b: 150 NUSD
    await deposit(4, 300n);  // investor-c: 300 NUSD
    await deposit(8, 5000n); // whale: 5000 NUSD

    // ── NAV update 1 ──────────────────────────────────────────────────────
    log('\n📋  NAV update 1');
    await postNAV(5, 92n); // reporter posts $92M NAV

    // ── Reserve updates ───────────────────────────────────────────────────
    log('\n📋  Reserve updates');
    await postReserve(5, 'T-Bills', 75n);  // $75M T-Bills
    await postReserve(5, 'Cash', 17n);     // $17M Cash

    // ── Round 2: More deposits ────────────────────────────────────────────
    log('\n📋  Round 2: More deposits');
    await deposit(9, 1000n); // spare: 1000 NUSD
    await deposit(2, 100n);  // investor-a adds more
    await deposit(3, 200n);  // investor-b adds more

    // ── Withdrawals ───────────────────────────────────────────────────────
    log('\n📋  Partial withdrawals');
    await withdraw(2, 50n);  // investor-a withdraws 50
    await withdraw(3, 75n);  // investor-b withdraws 75
    await withdraw(8, 1000n); // whale withdraws 1000

    // ── NAV update 2 ──────────────────────────────────────────────────────
    log('\n📋  NAV update 2 (slightly higher yield)');
    await postNAV(5, 93n); // $93M after yield

    // ── Final round: more activity ─────────────────────────────────────────
    log('\n📋  Round 3: Final activity');
    await deposit(4, 500n);   // investor-c big deposit
    await deposit(9, 500n);   // spare adds more
    await withdraw(9, 200n);  // spare partial withdraw

    log('\n═══════════════════════════════════════════');
    log('  ✅  DATA GENERATION COMPLETE');
    log(`  Finished: ${new Date().toISOString()}`);
    log('═══════════════════════════════════════════');
    log(`\nFull log: ${LOG_FILE}`);
  });
});
