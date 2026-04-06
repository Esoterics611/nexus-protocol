# Nexus Protocol — E2E Testing & Data Seeding Plan

> Playwright-based end-to-end test suite that operates 10 real Base Sepolia wallets
> through the frontend UI, generating authentic on-chain test data.

---

## Table of Contents

1. [Architecture Decision](#1-architecture-decision)
2. [How the Wallet Injection Works](#2-how-the-wallet-injection-works)
3. [Wallet Generation & Seeding Strategy](#3-wallet-generation--seeding-strategy)
4. [Project Structure](#4-project-structure)
5. [Test Scenarios](#5-test-scenarios)
6. [Debugging & Iteration Strategy](#6-debugging--iteration-strategy)
7. [Session Prompt (full, paste into Claude Sonnet)](#7-session-prompt)

---

## 1. Architecture Decision

### Why NOT Synpress / MetaMask extension

Synpress (the standard dApp Playwright framework) drives a real MetaMask browser extension.
This is realistic but:
- Extension management is brittle and slow to set up
- Extensions often break between Chrome/MetaMask versions
- Hard to run 10 wallets in parallel (separate browser profiles)
- Difficult to iterate quickly when debugging

### Why injected EIP-1193 provider ✅

The frontend's `wallet.ts` calls `window.ethereum.request(...)` — it doesn't care whether
that object is MetaMask or a custom object we inject. Playwright's `addInitScript` runs
before any page JavaScript, so we can set `window.ethereum` to our own object.

Our injected provider:
- Responds to `eth_requestAccounts` → returns the test wallet address
- Signs transactions with the private key via viem's `privateKeyToAccount`
- Submits signed transactions directly to the Base Sepolia RPC
- Returns proper chain ID (`0x14a34` = 84532)

**Result:** The frontend thinks it's talking to MetaMask. Tests submit real Base Sepolia
transactions. No browser extension required. 10 wallets = 10 private keys = trivial to run.

### Where it lives

Inside the nexus-protocol repo at `tests/e2e/` with its own `package.json`.
Keeps everything in one place. No separate repo needed.

---

## 2. How the Wallet Injection Works

The frontend `connect()` function:
```typescript
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
const wc = createWalletClient({ transport: custom(window.ethereum) })
```

Our injected provider (simplified):
```typescript
// Injected via page.addInitScript() before page load
window.ethereum = {
  isMetaMask: true,
  chainId: '0x14a34',  // Base Sepolia

  request: async ({ method, params }) => {
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [WALLET_ADDRESS]

      case 'eth_chainId':
        return '0x14a34'

      case 'eth_sendTransaction':
        // Sign with private key, submit to RPC, return txHash
        const signedTx = await signTransaction(params[0], PRIVATE_KEY)
        return await rpcSend('eth_sendRawTransaction', [signedTx])

      case 'personal_sign':
        // Sign message with private key
        return await signMessage(params[0], PRIVATE_KEY)

      case 'eth_signTypedData_v4':
        // EIP-712 signing (used by ERC-20 permit)
        return await signTypedData(params[1], PRIVATE_KEY)

      default:
        // Pass-through to RPC for reads (eth_call, eth_getBalance, etc.)
        return await rpcSend(method, params)
    }
  },

  on: (event, handler) => { /* store handlers for accountsChanged / chainChanged */ },
  removeListener: () => {}
}
```

The signing logic uses the `@noble/secp256k1` / `@noble/curves` primitives already
bundled with viem — no external deps needed in the injected script.

**Important:** The injected script must be self-contained (no imports) — it's a string
evaluated in the browser context. We'll use viem on the Node.js side to pre-sign or
use a lightweight inline secp256k1 implementation.

The pragmatic approach: use the **Node.js side for signing** via a CDP (Chrome DevTools
Protocol) channel, and have the `window.ethereum.request` call trigger a Playwright
`page.exposeFunction` that does the actual signing in Node.js.

---

## 3. Wallet Generation & Seeding Strategy

### Step 1 — Generate 10 wallets from one mnemonic

Use BIP-44 HD derivation so one backup covers everything:

```typescript
// scripts/generate-test-wallets.ts
import { generateMnemonic, mnemonicToAccount } from 'viem/accounts'
import { writeFileSync } from 'fs'

const mnemonic = generateMnemonic() // save this permanently!
const wallets = Array.from({ length: 10 }, (_, i) => {
  const account = mnemonicToAccount(mnemonic, { addressIndex: i })
  return {
    index: i,
    address: account.address,
    privateKey: account.getHdKey().privateKey // hex
  }
})

// Output to tests/e2e/.env.wallets (gitignored)
const envLines = [
  `TEST_MNEMONIC="${mnemonic}"`,
  ...wallets.map(w => `TEST_WALLET_${w.index}_ADDRESS=${w.address}`),
  ...wallets.map(w => `TEST_WALLET_${w.index}_PK=0x${w.privateKey}`)
]
writeFileSync('tests/e2e/.env.wallets', envLines.join('\n'))
console.table(wallets.map(w => ({ index: w.index, address: w.address })))
```

Run once: `npx tsx scripts/generate-test-wallets.ts`
Give Ronnie the mnemonic to back up and the address list to fund manually.

### Step 2 — Seed wallets from the deployer (manual ETH top-up, then automated)

Ronnie funds each test wallet with 0.05 ETH manually from MetaMask (one-time).

Then run the automated seeder:

```typescript
// scripts/seed-test-wallets.ts
// Uses the deployer's private key (from .env) to:
// 1. Grant KYC to all 10 test wallets (KYCRegistry.setKYC)
// 2. Set mint allocation for wallet[0] (the "admin" wallet) — MintController.setAllocation
// 3. Mint 10,000 NUSD to each wallet — MintController.mint (called by admin wallet)
// 4. Create a vault allocation for wallet[1] — so it can deposit

// This script runs in ~30 seconds and can be re-run any time
// to reset wallets to a known state
```

### Wallet Role Assignment

Give each wallet a specific role in tests so scenarios stay independent:

| Index | Address | Role | Starting State |
|-------|---------|------|---------------|
| 0 | `0x...` | admin | 0.05 ETH, has ADMIN_ROLE |
| 1 | `0x...` | minter | 0.05 ETH, 100k NUSD allocation, KYC'd |
| 2 | `0x...` | investor-a | 0.05 ETH, 10k NUSD, KYC'd |
| 3 | `0x...` | investor-b | 0.05 ETH, 10k NUSD, KYC'd |
| 4 | `0x...` | investor-c | 0.05 ETH, 10k NUSD, KYC'd |
| 5 | `0x...` | reporter | 0.05 ETH, KYC'd, REPORTER_ROLE |
| 6 | `0x...` | restricted | 0.05 ETH (on restriction list — for compliance tests) |
| 7 | `0x...` | no-kyc | 0.05 ETH, NOT KYC'd |
| 8 | `0x...` | whale | 0.05 ETH, 1M NUSD, KYC'd |
| 9 | `0x...` | spare | 0.05 ETH, 10k NUSD, KYC'd |

---

## 4. Project Structure

```
nexus-protocol/
└── tests/e2e/
    ├── package.json           # separate deps: playwright, viem, dotenv, tsx
    ├── playwright.config.ts   # baseURL, screenshots on failure, slow timeout for testnet
    ├── .env.example           # template (NEVER commit .env.wallets)
    ├── .gitignore             # ignore .env.wallets, test-results/
    │
    ├── wallets/
    │   ├── generate.ts        # HD wallet generation → .env.wallets
    │   ├── seed.ts            # KYC + fund all test wallets from deployer
    │   └── index.ts           # load wallet config from env, export typed array
    │
    ├── fixtures/
    │   ├── wallet-fixture.ts  # Playwright fixture: injects window.ethereum per wallet
    │   └── page-helpers.ts    # waitForTx, waitForToast, connectWallet, etc.
    │
    ├── inject/
    │   └── ethereum-provider.ts  # The window.ethereum injection string + Node signing bridge
    │
    └── scenarios/
        ├── 01-connect-wallet.spec.ts      # all 10 wallets can connect
        ├── 02-mint-nusd.spec.ts           # wallet[1] mints NUSD
        ├── 03-vault-deposit.spec.ts       # wallet[2,3,4] deposit into vault
        ├── 04-vault-withdraw.spec.ts      # wallet[2] withdraws
        ├── 05-nav-oracle.spec.ts          # wallet[5] posts NAV
        ├── 06-compliance-kyc.spec.ts      # wallet[6] (restricted) can't deposit
        ├── 07-compliance-nokyc.spec.ts    # wallet[7] (no KYC) can't deposit
        ├── 08-portfolio.spec.ts           # wallet[2] portfolio shows position
        ├── 09-admin-dashboard.spec.ts     # wallet[0] admin actions
        └── 10-data-generation.spec.ts     # bulk: 50 deposits/withdrawals for test data
```

---

## 5. Test Scenarios

### Scenario 01 — Connect Wallet (smoke test)
All 10 wallets load the app, click CONNECT WALLET, verify address shown in header.
If this passes, the injection works.

### Scenario 02 — Mint NUSD
wallet[1] (minter) navigates to `/admin/mint`, mints 1,000 NUSD to wallet[2].
Assert: total supply increased, wallet[2] balance shows 1,000 NUSD on portfolio page.

### Scenario 03 — Vault Deposit
wallet[2], [3], [4] each deposit 500 NUSD into the Treasury Vault.
Assert: vault TVL increases by 1,500 NUSD, each wallet's portfolio shows position.
Assert: indexer `/api/vault-transactions` shows 3 new deposit entries.

### Scenario 04 — Vault Withdraw
wallet[2] withdraws 250 NUSD from the vault.
Assert: portfolio position reduced, NUSD balance increased.
Assert: TxButton shows success, no error toast.

### Scenario 05 — NAV Oracle
wallet[5] (reporter) navigates to `/admin/oracle`, posts a NAV of $92M.
Assert: oracle page updates, NAV history table shows new entry.
Assert: indexer `/api/nav-history` returns the new entry within 30 seconds (next poll).

### Scenario 06 — Compliance: Restricted Wallet
wallet[6] (on restriction list) tries to deposit into vault.
Assert: transaction reverts, TxButton shows a meaningful error (not just "reverted").

### Scenario 07 — Compliance: No KYC
wallet[7] (not KYC'd) tries to deposit.
Assert: reverts with KYC error, proper message shown.

### Scenario 08 — Portfolio View
wallet[2] (has vault position) navigates to `/portfolio`.
Assert: vault position shown with correct share count and USD value.
Assert: transaction history table shows the deposit and partial withdrawal.

### Scenario 09 — Admin Dashboard
wallet[0] (admin) checks reserve ratio, oracle freshness, pause status.
Assert: all stats load without error.
wallet[0] sets new allocation for wallet[9], confirms success toast.

### Scenario 10 — Bulk Data Generation
Non-interactive script: runs 50 vault deposit + 20 withdraw actions across wallets [2-5] and [8-9].
This is NOT a pass/fail test — it's a data generator.
Produces: realistic NAV history, transfer history, vault deposit/withdrawal history.
Run this before demos or before testing the indexer's catch-up behavior.

---

## 6. Debugging & Iteration Strategy

### Screenshot on every failure
`playwright.config.ts`:
```typescript
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
  trace: 'on-first-retry',
}
```

All artifacts in `tests/e2e/test-results/` (gitignored).

### Headed mode for debugging
```bash
npx playwright test --headed --slow-mo=500 scenarios/03-vault-deposit.spec.ts
```
Watch the browser like a human would. Slow-mo makes it legible.

### Test tags for fast iteration
```typescript
test.describe('vault deposit @smoke', () => { ... })
```
```bash
npx playwright test --grep @smoke  # only run smoke tests (~2 min)
npx playwright test --grep @data   # only run data generation
```

### Single wallet debugging
Each test fixture accepts a `walletIndex` param:
```typescript
test('deposit', async ({ walletPage }) => {
  // walletPage is already connected as wallet[2]
  await walletPage.goto('/vaults/0x...')
  await walletPage.deposit('500')
  await walletPage.expectSuccess()
})
```

### Tx timeout handling
Base Sepolia blocks every ~2s but can be slow. Set generous timeouts:
```typescript
// playwright.config.ts
timeout: 120_000,        // 2 min per test
expect: { timeout: 30_000 }  // 30s for assertions

// In tests: wait for indexer to pick up the tx
await expect(async () => {
  const history = await page.request.get('http://localhost:3001/api/vault-transactions?...')
  expect(history.json()).toHaveLength(greaterThan(prev))
}).toPass({ timeout: 60_000 })  // wait up to 60s for indexer to catch up
```

### RPC rate limiting
drpc.org (public) will rate-limit 10 wallets hitting it simultaneously.
For tests: use a private RPC in `.env.wallets`:
```
TEST_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```
Alchemy free tier gives 300M compute units/month — plenty for testing.

---

## 7. Session Prompt

Paste this into a **new Claude Sonnet session** to build the full test suite:

```
You are working on Nexus Protocol. This session builds a Playwright E2E test suite
at tests/e2e/ inside the nexus-protocol repo.

Read these files FIRST:
1. CLAUDE.md — project conventions
2. docs/TESTING_PLAN.md — the full architecture and plan (THIS IS YOUR SPEC)
3. frontend/src/lib/stores/wallet.ts — the wallet connection implementation
4. docs/TESTNET_DEPLOYMENT.md — deployed contract addresses

Context:
- Frontend: SvelteKit + viem, uses window.ethereum (raw EIP-1193, no wagmi)
- Contracts: deployed on Base Sepolia (addresses in docs/TESTNET_DEPLOYMENT.md)
- Indexer: running on localhost:3001
- Frontend: running on localhost:5173 (npm run dev)

Architecture decision (in the plan doc):
  The frontend uses window.ethereum directly. We inject a fake EIP-1193 provider via
  Playwright's page.addInitScript() that signs real transactions with test private keys
  and submits them to Base Sepolia RPC. No MetaMask extension needed.

BUILD IN THIS ORDER:

=== PHASE 1: Wallet tooling (30 min) ===

1. Create tests/e2e/package.json:
{
  "name": "@nexus-protocol/e2e",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:smoke": "playwright test --grep @smoke",
    "generate-wallets": "tsx wallets/generate.ts",
    "seed-wallets": "tsx wallets/seed.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "viem": "^2.x",
    "tsx": "^4.x",
    "dotenv": "^16.x"
  }
}

2. Create tests/e2e/playwright.config.ts:
- baseURL: http://localhost:5173
- screenshot: only-on-failure
- video: retain-on-failure
- trace: on-first-retry
- timeout: 120_000
- retries: 1 (testnet flakiness tolerance)
- workers: 1 (sequential — we're submitting real txs, avoid nonce conflicts)

3. Create tests/e2e/wallets/generate.ts:
- Use viem's generateMnemonic() + mnemonicToAccount(mnemonic, { addressIndex: i })
- Generate 10 wallets (indices 0-9)
- Output tests/e2e/.env.wallets with:
    TEST_MNEMONIC="..."
    TEST_RPC_URL=https://base-sepolia.drpc.org
    TEST_WALLET_0_ADDRESS=0x...
    TEST_WALLET_0_PK=0x...
    (repeat for 0-9)
- Print a table of addresses to console (for Ronnie to fund manually)
- Print the mnemonic prominently: "SAVE THIS MNEMONIC — BACK IT UP NOW"

4. Create tests/e2e/wallets/index.ts:
- Load .env.wallets with dotenv
- Export typed array: TestWallet[] = { index, address, privateKey, role }
- Roles from the plan: admin, minter, investor-a, investor-b, investor-c,
  reporter, restricted, no-kyc, whale, spare

5. Create tests/e2e/wallets/seed.ts:
- Reads deployer private key from ../../services/indexer/.env (DEPLOYER_PK)
  (you'll need to document that Ronnie adds DEPLOYER_PK to that file)
- For each test wallet, uses viem walletClient to:
    a. Call KYCRegistry.setKYC(address, true, expiry) for wallets 0-5, 8, 9
    b. Leave wallet[6] on restriction list (call RestrictionList.restrict)
    c. Leave wallet[7] with no KYC
    d. Call MintController.setAllocation(wallet[1].address, 1_000_000_000_000n)
       (1M NUSD allocation for the minter wallet)
    e. Using wallet[1], mint 10_000_000_000n NUSD (10k) to wallets 2-5, 9
    f. Using wallet[1], mint 1_000_000_000_000n NUSD (1M) to wallet[8]
- Print results: "✅ KYC granted: 0x...", "✅ Minted 10,000 NUSD → 0x..."
- NOTE: Ronnie will manually send 0.05 ETH to each address first

=== PHASE 2: Playwright wallet injection (45 min) ===

6. Create tests/e2e/inject/ethereum-provider.ts:
The key challenge: the injected script runs in browser context (no imports).
Use Playwright's page.exposeFunction to bridge signing to Node.js.

Approach:
- In the fixture setup, call page.exposeFunction('__nexusSign', signFn)
  where signFn is a Node.js function using viem's privateKeyToAccount to sign
- The injected window.ethereum calls window.__nexusSign() for sendTransaction/sign
- For read methods (eth_call, eth_getBalance, etc.), forward to RPC directly

Create the injection script as a template string that:
  a. Sets window.ethereum.isMetaMask = true
  b. Sets chainId = '0x14a34' (Base Sepolia)
  c. Implements request() with:
     - eth_requestAccounts / eth_accounts → [WALLET_ADDRESS]
     - eth_chainId / net_version → '0x14a34' / '84532'
     - eth_sendTransaction → calls window.__nexusSign({method, params})
     - personal_sign → calls window.__nexusSign({method, params})
     - eth_signTypedData_v4 → calls window.__nexusSign({method, params})
     - everything else → fetch to RPC_URL

7. Create tests/e2e/fixtures/wallet-fixture.ts:
- Playwright fixture that:
  a. Accepts walletIndex parameter
  b. Exposes __nexusSign function using viem privateKeyToAccount(wallets[walletIndex].privateKey)
     The sign function handles:
     - sendTransaction: sign tx, submit to RPC, return txHash
     - personal_sign: sign message
     - eth_signTypedData_v4: sign typed data
  c. Calls page.addInitScript with the ethereum provider string (with WALLET_ADDRESS interpolated)
  d. Returns enhanced page with helper methods

8. Create tests/e2e/fixtures/page-helpers.ts with methods:
- connectWallet() — clicks "CONNECT WALLET" button, waits for address to appear
- deposit(amount: string) — fills amount input, clicks deposit button, waits for tx
- withdraw(amount: string) — fills amount input, clicks withdraw button, waits for tx
- expectSuccess() — asserts no error toast appeared
- expectRevert(messageSubstring: string) — asserts error toast contains text
- waitForIndexer(endpoint: string, predicate: (data) => boolean) — polls indexer until true

=== PHASE 3: Test scenarios (60 min) ===

9. Write test scenarios in the order listed in the plan.
Start with 01-connect-wallet.spec.ts as the smoke test — it must pass before proceeding.

For each scenario:
- Import the walletFixture
- Use test.describe with a @tag comment
- Keep each test < 50 lines
- Log tx hashes to console for debugging: console.log('Deposit tx:', txHash)
- Use Playwright's expect.poll for indexer assertions

10. Write 10-data-generation.spec.ts last:
- This is tagged @data not @smoke
- Runs 50 operations: mix of deposits/withdrawals across 6 wallets
- Logs all tx hashes to tests/e2e/test-results/data-generation.log
- No assertions — if it throws, log and continue to next operation

=== PHASE 4: Documentation ===

11. Create tests/e2e/README.md covering:
- Prerequisites (Node 22, running frontend + indexer)
- One-time setup:
    cd tests/e2e && npm install
    npm run generate-wallets   # prints addresses to fund
    # [Ronnie manually sends 0.05 ETH to each address]
    # [Add DEPLOYER_PK to services/indexer/.env]
    npm run seed-wallets       # KYC + mint NUSD
- Running tests:
    npm test                   # all tests
    npm run test:smoke         # fast smoke tests only
    npm run test:headed        # watch mode
    npx playwright test --ui   # Playwright UI mode (best for debugging)
- Debugging tips:
    Set PWDEBUG=1 for step-through debugger
    Check test-results/ for screenshots and videos on failure
    Set TEST_RPC_URL to a private RPC if hitting rate limits

12. Create tests/e2e/.env.example:
TEST_MNEMONIC=
TEST_RPC_URL=https://base-sepolia.drpc.org
TEST_WALLET_0_ADDRESS=
TEST_WALLET_0_PK=
# ... (all 10 wallets)

13. Create tests/e2e/.gitignore:
.env.wallets
node_modules/
test-results/
playwright-report/

KEY TECHNICAL NOTES:
- workers: 1 in playwright.config.ts — sequential to avoid nonce conflicts (all wallets share a chain)
- Each test should be independently runnable, not dependent on prior tests
- For tx waiting: use viem's waitForTransactionReceipt in the Node.js sign bridge
- Contract addresses come from docs/TESTNET_DEPLOYMENT.md — hardcode them in wallets/seed.ts
- ABI fragments needed in seed.ts: just the specific functions called (setKYC, setAllocation, mint, restrict)
  — inline minimal ABI arrays, don't import the full ABI files

WHEN DONE:
- Run: cd tests/e2e && npx playwright install chromium
- Run: npm run generate-wallets
- Print the 10 addresses for Ronnie to fund with Base Sepolia ETH
- Confirm: npm run test:smoke passes once funded + seeded
- Update docs/PHASE_TRACKER.md with E2E test status
```
