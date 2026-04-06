/**
 * Loads test wallet configuration from .env.wallets.
 * Import this anywhere you need wallet addresses or keys.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.wallets') });

export type WalletRole =
  | 'admin'        // wallet[0]: has DEFAULT_ADMIN_ROLE on all contracts
  | 'minter'       // wallet[1]: has mint allocation, can mint NUSD
  | 'investor-a'   // wallet[2]: KYC'd, 10k NUSD, deposits into vault
  | 'investor-b'   // wallet[3]: KYC'd, 10k NUSD, deposits into vault
  | 'investor-c'   // wallet[4]: KYC'd, 10k NUSD, deposits into vault
  | 'reporter'     // wallet[5]: KYC'd, has REPORTER_ROLE for NAV/reserve posting
  | 'restricted'   // wallet[6]: on RestrictionList — should be blocked from transfers
  | 'no-kyc'       // wallet[7]: NOT KYC'd — should be blocked from vault
  | 'whale'        // wallet[8]: KYC'd, 1M NUSD
  | 'spare';       // wallet[9]: KYC'd, 10k NUSD, available for ad-hoc tests

export interface TestWallet {
  index: number;
  role: WalletRole;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

const roles: WalletRole[] = [
  'admin', 'minter', 'investor-a', 'investor-b', 'investor-c',
  'reporter', 'restricted', 'no-kyc', 'whale', 'spare',
];

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function requireEnv(key: string): string {
  const val = readEnv(key);
  if (!val) {
    throw new Error(
      `Missing env var: ${key}\n` +
      `Run: npm run generate-wallets  (then fill in DEPLOYER_PK)`
    );
  }
  return val;
}

// Build wallet list — uses placeholder values when .env.wallets not present
// (so `playwright test --list` works before setup).
// The fixture will throw with a clear message if keys are actually missing at runtime.
export const wallets: TestWallet[] = Array.from({ length: 10 }, (_, i) => ({
  index: i,
  role: roles[i],
  address: (readEnv(`TEST_WALLET_${i}_ADDRESS`) ?? `0x${'0'.repeat(40)}`) as `0x${string}`,
  privateKey: (readEnv(`TEST_WALLET_${i}_PK`) ?? `0x${'0'.repeat(64)}`) as `0x${string}`,
}));

/** Throws with a helpful message if wallets haven't been generated yet. */
export function assertWalletsConfigured() {
  if (!readEnv('TEST_WALLET_0_ADDRESS')) {
    throw new Error(
      '❌  Test wallets not configured.\n' +
      '    Run: cd tests/e2e && npm run generate-wallets\n' +
      '    Then: add DEPLOYER_PK to .env.wallets and run npm run seed-wallets'
    );
  }
}

export const RPC_URL = process.env.TEST_RPC_URL || 'https://base-sepolia.drpc.org';
export const DEPLOYER_PK = process.env.DEPLOYER_PK as `0x${string}` | undefined;

export function getWallet(role: WalletRole): TestWallet {
  const w = wallets.find(w => w.role === role);
  if (!w) throw new Error(`No wallet with role: ${role}`);
  return w;
}

// Contract addresses — Base Sepolia deployment 2026-04-05
export const CONTRACTS = {
  stablecoin:           '0x82671ab3119c8f73acc0ee43c6b167b46b948141' as `0x${string}`,
  mintController:       '0xee9b15f35ea7a9920c38ac1aacd5af265931886a' as `0x${string}`,
  navOracle:            '0x28dc5ccc6a97675b7def7b4c4179b85127b698f3' as `0x${string}`,
  vaultFactory:         '0x7802ee123ef4a834987f69ed020da67881ce86b0' as `0x${string}`,
  yieldVault:           '0x6671D7937ae8b9120A673724FD26CF06e61b4F67' as `0x${string}`,
  reserveTracker:       '0x9e9abd3734140eb7de220e190cc63436405ab219' as `0x${string}`,
  restrictionList:      '0xea1ea3239ac1731acb6cffbe666fa6ff55e5a669' as `0x${string}`,
  kycRegistry:          '0xadac3b940503626d5c72e202bf165c572d3ea11a' as `0x${string}`,
  accreditedInvestor:   '0xd30fc13df30b31bc6d4c5fe7e3ee3877093fcf31' as `0x${string}`,
  transferRestrictions: '0xbaa4050fef138f3f9dc19373db6b57860059c5a9' as `0x${string}`,
} as const;
