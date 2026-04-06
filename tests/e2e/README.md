# Nexus Protocol — E2E Test Suite

Playwright tests that operate real Base Sepolia wallets through the frontend UI.

**No MetaMask needed.** The suite injects a fake `window.ethereum` provider that signs
real testnet transactions using private keys stored in `.env.wallets`.

---

## Prerequisites

- Node.js 22+
- Base Sepolia ETH in each test wallet (see One-Time Setup below)
- Frontend running: `cd ../../frontend && npm run dev`
- Indexer running: `cd ../.. && docker compose up -d`

---

## One-Time Setup

### Step 1 — Install deps + Playwright browser

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

### Step 2 — Generate 10 test wallets

```bash
npm run generate-wallets
```

This prints:
- The mnemonic (BACK IT UP — one mnemonic = all 10 wallets)
- A table of 10 wallet addresses

### Step 3 — Fund wallets with Base Sepolia ETH

Send **0.05 ETH** to each of the 10 addresses from MetaMask (manual, one-time).
Base Sepolia ETH faucets:
- https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- https://faucet.quicknode.com/base/sepolia

### Step 4 — Add deployer private key

Edit `tests/e2e/.env.wallets` and fill in:
```
DEPLOYER_PK=0x<your deployer private key>
```
The deployer is `0x41521c37dB02956185437C4e2461261A321073E1` — the account with all admin roles.
It's used ONLY for seeding (KYC + NUSD minting). It never runs in browser tests.

Optionally set a private RPC to avoid rate limits:
```
TEST_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Step 5 — Seed test wallets

```bash
npm run seed-wallets
```

This takes ~2-3 minutes and:
- Grants KYC to 8 of the 10 wallets
- Adds wallet[6] to the restriction list
- Grants REPORTER_ROLE to wallet[5]
- Mints NUSD: 10,000 to investors, 1,000,000 to whale
- Sets mint allocation for wallet[1] (minter)

**Re-run any time** to top up wallets or reset state.

---

## Running Tests

```bash
# All tests (sequential — takes ~15-20 min for full suite)
npm test

# Smoke tests only (~5 min — recommended first run)
npm run test:smoke

# Watch mode — see the browser
npm run test:headed

# Interactive UI mode (best for debugging)
npm run test:ui

# Bulk data generation only (fills testnet with realistic data)
npm run test:data

# Single scenario
npx playwright test scenarios/03-vault-deposit.spec.ts

# Debug mode (step-through in browser)
npm run test:debug
```

---

## Test Wallets

| # | Role | Description |
|---|------|-------------|
| 0 | admin | DEFAULT_ADMIN_ROLE on all contracts |
| 1 | minter | Has mint allocation, can mint NUSD |
| 2 | investor-a | KYC'd, 10k NUSD, main deposit/withdraw tester |
| 3 | investor-b | KYC'd, 10k NUSD |
| 4 | investor-c | KYC'd, 10k NUSD |
| 5 | reporter | REPORTER_ROLE — posts NAV and reserves |
| 6 | restricted | On the restriction list — all transfers blocked |
| 7 | no-kyc | Not KYC'd — blocked from vault |
| 8 | whale | KYC'd, 1M NUSD — for large position tests |
| 9 | spare | KYC'd, 10k NUSD — general purpose |

---

## Scenarios

| File | Tag | What it tests |
|------|-----|--------------|
| `01-connect-wallet` | @smoke | All 10 wallets can connect via injected provider |
| `02-mint-nusd` | @smoke | Minter mints 500 NUSD, supply increases |
| `03-vault-deposit` | @smoke | investor-a deposits 100 NUSD, shares received |
| `04-vault-withdraw` | @smoke | investor-a withdraws 50 NUSD |
| `05-nav-oracle` | @smoke | Reporter posts NAV, indexer records it |
| `06-compliance-restricted` | @smoke | Restricted wallet deposit reverts |
| `07-compliance-nokyc` | @smoke | No-KYC wallet deposit reverts |
| `08-portfolio` | @smoke | Portfolio page shows investor-a's position |
| `09-admin-dashboard` | @smoke | Admin views stats, sets allocation |
| `10-data-generation` | @data | Bulk: 15+ deposits/withdrawals/NAV updates |

---

## Debugging

### Screenshots & Videos
Saved automatically on failure to `test-results/`. Check there first.

### Headed mode
```bash
npm run test:headed
```
Watch the browser execute the test in real time.

### Playwright UI
```bash
npm run test:ui
```
Pick individual tests, rerun, see timeline, inspect DOM.

### Console logs
The fixture logs every transaction hash:
```
  [investor-a] tx: 0xabc123...
```
Copy the hash and check https://sepolia.basescan.org to see what happened on-chain.

### RPC rate limiting
If you see many `fetch failed` errors, switch to a private RPC:
```
TEST_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```
in `.env.wallets`.

### Indexer not catching up
Scenarios that wait for indexer data use `expect.poll` with up to 90s timeout.
If tests time out here:
```bash
curl http://localhost:3001/api/indexer-status
docker compose logs indexer --tail=20
```

---

## Architecture Notes

The key trick: `window.ethereum` is injected via `page.addInitScript()` before any
page JavaScript runs. The frontend's `wallet.ts` sees it identically to MetaMask.

Signing happens in Node.js (not the browser) via `page.exposeFunction`:
```
browser: window.ethereum.request({ method: 'eth_sendTransaction', params })
  → window.__nexusWalletRequest(method, params)  ← Playwright bridge
    → Node.js: sign with viem + privateKeyToAccount
    → submit eth_sendRawTransaction to Base Sepolia RPC
    → wait for receipt
  ← return txHash
browser: walletClient.waitForTransactionReceipt resolves
```

No extensions, no flakiness from extension updates, easy to run in CI.
