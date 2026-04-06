/**
 * Seeds test wallets on Base Sepolia.
 * Run once after generate-wallets and after funding each address with 0.05 ETH.
 *
 * What this does:
 *   1. Sets deployer's own mint allocation (needed to mint to others)
 *   2. Grants KYC to wallets 0-5, 8, 9
 *   3. Adds wallet[6] to the restriction list
 *   4. Grants REPORTER_ROLE to wallet[5] on NAVOracle + ReserveTracker
 *   5. Mints NUSD to funded wallets
 *   6. Sets wallet[1] (minter) its own allocation for test scenarios
 *
 * Run: npm run seed-wallets
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { wallets, CONTRACTS, RPC_URL, DEPLOYER_PK, getWallet } from './index.js';

if (!DEPLOYER_PK) {
  console.error('❌ DEPLOYER_PK not set in .env.wallets');
  console.error('   Add your deployer private key (0x41521c37...) to tests/e2e/.env.wallets');
  process.exit(1);
}

const deployer = privateKeyToAccount(DEPLOYER_PK);
console.log(`\n🔑  Deployer: ${deployer.address}`);

const transport = http(RPC_URL);
const chain = baseSepolia;

const publicClient = createPublicClient({ chain, transport });
const deployerClient = createWalletClient({ account: deployer, chain, transport });

// ── Minimal ABIs ───────────────────────────────────────────────────────────────

const KYC_ABI = parseAbi([
  'function setVerified(address account, uint256 expiry) external',
]);

const RESTRICTION_ABI = parseAbi([
  'function restrict(address account) external',
]);

const MINT_CONTROLLER_ABI = parseAbi([
  'function setMintAllocation(address minter, uint256 ceiling) external',
  'function mint(address to, uint256 amount) external',
]);

const ACCESS_CONTROL_ABI = parseAbi([
  'function grantRole(bytes32 role, address account) external',
]);

// REPORTER_ROLE = keccak256("REPORTER_ROLE")
const REPORTER_ROLE = '0x9b7e659e9ab2a58efb59de46c4b53c1e82ef15e1ec9cd0dd73def5c49f84dfc7' as `0x${string}`;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function send(description: string, fn: () => Promise<`0x${string}`>) {
  process.stdout.write(`  ${description}...`);
  try {
    const hash = await fn();
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(` ✅  ${hash.slice(0, 10)}...`);
  } catch (err: any) {
    console.log(` ❌  ${err.shortMessage || err.message}`);
    throw err;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

const KYC_EXPIRY = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60); // 1 year
const ONE_MILLION_NUSD = 1_000_000_000_000n;  // 1M * 1e6
const TEN_THOUSAND_NUSD = 10_000_000_000n;    // 10k * 1e6
const ONE_MILLION_MINT  = 1_000_000_000_000n; // minter wallet allocation

console.log('\n═══════════════════════════════════════');
console.log('  NEXUS PROTOCOL — SEEDING TEST WALLETS');
console.log('═══════════════════════════════════════\n');

// Step 1: Set deployer's own allocation so it can mint
console.log('📋  Step 1: Set deployer mint allocation');
await send('setMintAllocation(deployer, 100M NUSD)', () =>
  deployerClient.writeContract({
    address: CONTRACTS.mintController,
    abi: MINT_CONTROLLER_ABI,
    functionName: 'setMintAllocation',
    args: [deployer.address, ONE_MILLION_NUSD * 100n],
  })
);

// Step 2: Grant KYC to wallets 0-5, 8, 9 (skip 6=restricted, 7=no-kyc)
console.log('\n📋  Step 2: Grant KYC');
const kycWallets = [0, 1, 2, 3, 4, 5, 8, 9];
for (const idx of kycWallets) {
  const w = wallets[idx];
  await send(`KYC: wallet[${idx}] ${w.role} (${w.address.slice(0, 10)}...)`, () =>
    deployerClient.writeContract({
      address: CONTRACTS.kycRegistry,
      abi: KYC_ABI,
      functionName: 'setVerified',
      args: [w.address, KYC_EXPIRY],
    })
  );
}

// Step 3: Restrict wallet[6]
console.log('\n📋  Step 3: Restrict wallet[6] (restricted role)');
const restricted = getWallet('restricted');
await send(`restrict(${restricted.address.slice(0, 10)}...)`, () =>
  deployerClient.writeContract({
    address: CONTRACTS.restrictionList,
    abi: RESTRICTION_ABI,
    functionName: 'restrict',
    args: [restricted.address],
  })
);

// Step 4: Grant REPORTER_ROLE to wallet[5] on NAVOracle and ReserveTracker
console.log('\n📋  Step 4: Grant REPORTER_ROLE to wallet[5] (reporter)');
const reporter = getWallet('reporter');
await send(`grantRole REPORTER_ROLE on NAVOracle`, () =>
  deployerClient.writeContract({
    address: CONTRACTS.navOracle,
    abi: ACCESS_CONTROL_ABI,
    functionName: 'grantRole',
    args: [REPORTER_ROLE, reporter.address],
  })
);
await send(`grantRole REPORTER_ROLE on ReserveTracker`, () =>
  deployerClient.writeContract({
    address: CONTRACTS.reserveTracker,
    abi: ACCESS_CONTROL_ABI,
    functionName: 'grantRole',
    args: [REPORTER_ROLE, reporter.address],
  })
);

// Step 5: Mint NUSD to funded wallets
console.log('\n📋  Step 5: Mint NUSD');
const mintTargets: Array<{ role: string; amount: bigint }> = [
  { role: 'investor-a', amount: TEN_THOUSAND_NUSD },
  { role: 'investor-b', amount: TEN_THOUSAND_NUSD },
  { role: 'investor-c', amount: TEN_THOUSAND_NUSD },
  { role: 'reporter',   amount: TEN_THOUSAND_NUSD },
  { role: 'minter',     amount: TEN_THOUSAND_NUSD },
  { role: 'whale',      amount: ONE_MILLION_NUSD  },
  { role: 'spare',      amount: TEN_THOUSAND_NUSD },
];

for (const { role, amount } of mintTargets) {
  const w = getWallet(role as any);
  const display = `${Number(amount) / 1e6} NUSD → wallet[${w.index}] ${w.role}`;
  await send(`mint(${display})`, () =>
    deployerClient.writeContract({
      address: CONTRACTS.mintController,
      abi: MINT_CONTROLLER_ABI,
      functionName: 'mint',
      args: [w.address, amount],
    })
  );
}

// Step 6: Set wallet[1] (minter) its own allocation for test 02
console.log('\n📋  Step 6: Set minter wallet allocation for test scenarios');
const minter = getWallet('minter');
await send(`setMintAllocation(wallet[1]/minter, 1M NUSD)`, () =>
  deployerClient.writeContract({
    address: CONTRACTS.mintController,
    abi: MINT_CONTROLLER_ABI,
    functionName: 'setMintAllocation',
    args: [minter.address, ONE_MILLION_MINT],
  })
);

console.log('\n═══════════════════════════════════════');
console.log('  ✅  SEEDING COMPLETE');
console.log('═══════════════════════════════════════\n');
console.log('Test wallets are ready. Run the tests:');
console.log('  npm test              # all tests');
console.log('  npm run test:smoke    # smoke only (~5 min)');
console.log('  npm run test:headed   # watch mode\n');
