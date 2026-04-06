# Frontend Wiring Plan — Nexus Protocol

## Context

The smart contracts compile, deploy, and pass 46 tests. The SvelteKit frontend has 9 pages scaffolded with placeholder data but zero contract interaction. This plan wires every page to real contracts, organized by the institutional user roles: traders, sales/cash onboarding, compliance, risk, and DAO ops.

## Architecture Decision

**No VaultFactory in deploy/seed scripts** — both scripts deploy YieldVault directly. The frontend expects to enumerate vaults via `VaultFactory.getVaultCount()` / `getVault(i)`. Both scripts need updating to deploy the factory and create vaults through it.

**Seed script uses old Hardhat v2 API** (`hre.viem.deployContract`) — needs the same `hre.network.connect()` fix we applied to `deploy.ts`.

---

## Phase 1: Infrastructure (must complete before any page work)

### 1A. Fix seed script for Hardhat v3 API
**File:** `scripts/seed.ts`
- Replace `hre.viem.getWalletClients()` / `hre.viem.getPublicClient()` / `hre.viem.deployContract()` with `hre.network.connect()` pattern (matching `deploy.ts`)
- Add `YieldVaultFactory` deployment — create vault through factory instead of deploying standalone
- Write all contract addresses to `frontend/src/lib/contracts/deployments.json` at end of script
- **Test:** `npx hardhat run scripts/seed.ts` completes, JSON file created

### 1B. Update deploy script to include VaultFactory + JSON output
**File:** `scripts/deploy.ts`
- Add `YieldVaultFactory` deployment after ReserveTracker/AuditLog
- Create vault via `factory.write.createVault(...)` instead of standalone deploy
- Set TransferRestrictions on factory-created vault (get address from factory)
- Write addresses JSON to `frontend/src/lib/contracts/deployments.json` via `writeFileSync`
- **Test:** `npx hardhat run scripts/deploy.ts` outputs JSON

### 1C. Add walletClient to wallet store
**File:** `frontend/src/lib/stores/wallet.ts`
- Add `walletClient` writable store (null initially)
- In `connect()`: after getting accounts, create walletClient via `createWalletClient({ account, chain, transport: custom(window.ethereum) })`
- Make RPC URL configurable: `import.meta.env.VITE_RPC_URL || "https://sepolia.base.org"`
- Make chain configurable for localhost (chainId 31337) vs Base Sepolia (84532)
- Add `accountsChanged` / `chainChanged` event listeners
- In `disconnect()`: clear walletClient
- **Test:** connect MetaMask, verify walletClient is populated

### 1D. Contract helper module
**New file:** `frontend/src/lib/contracts/index.ts`
- Import all ABIs and addresses
- Import `deployments.json` with fallback (try/catch for when file doesn't exist)
- Export getter functions: `getStablecoin(client)`, `getVault(address, client)`, `getVaultFactory(client)`, `getMintController(client)`, `getRestrictionList(client)`, `getKYCRegistry(client)`, `getAccreditedInvestor(client)`, `getNAVOracle(client)`, `getReserveTracker(client)`
- Each calls `getContract({ address, abi, client })` from viem
- Export `getAddresses()` returning resolved contract addresses

### 1E. Addresses module update
**File:** `frontend/src/lib/contracts/addresses.ts`
- Add `localhost` chain config (chainId 31337, RPC `http://127.0.0.1:8545`)
- Import `deployments.json` addresses as fallback (try/catch)
- Select chain via `import.meta.env.VITE_CHAIN` (default: `"baseSepolia"`)

### 1F. ABI additions
**File:** `frontend/src/lib/contracts/abis.ts`
- Add `previewRedeem` to `YIELD_VAULT_ABI` — needed for withdraw preview
- Add `ACCREDITED_INVESTOR_ABI` — `isAccredited(address)`, `setAccredited(address, bool)`, `batchSetAccredited(address[], bool)`
- Add `getReserveHistory` to `RESERVE_TRACKER_ABI` — returns full `ReserveEntry[]` array for history table
- Add `oracle()` view to `YIELD_VAULT_ABI` — returns current oracle address

### 1G. Frontend environment file
**New file:** `frontend/.env.local` (gitignored)
```
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN=localhost
```

---

## Phase 2: Shared Components

### 2A. Toast notification system
**New file:** `frontend/src/lib/stores/toast.ts`
- Array store of `{ id, message, type: 'success'|'error'|'info', duration }`
- `addToast(message, type, duration=5000)` — adds toast, auto-removes after duration
**New file:** `frontend/src/lib/components/Toast.svelte`
- Fixed bottom-right position, stack of toast items, fade-out animation
**Modify:** `frontend/src/routes/+layout.svelte` — add `<Toast />` component

### 2B. TxButton component
**New file:** `frontend/src/lib/components/TxButton.svelte`
- Props: `label`, `loadingLabel`, `onclick: () => Promise<void>`, `disabled`
- States: idle → pending (spinner) → success/error (auto-resets)
- Integrates with toast store: success = green toast, error = red toast with message

---

## Phase 3: Investor Pages (read-only first, then writes)

### 3A. Landing page — reads
**File:** `frontend/src/routes/+page.svelte`
**Who uses it:** All users — first impression, protocol overview
**Reads (no wallet):**
- `stablecoin.read.totalSupply()` → "NUSD Supply" stat card
- `vaultFactory.read.getVaultCount()` → "Active Vaults" stat card
- Loop vaults: `getVault(i)` → `vault.read.totalAssets()` → sum for "Total TVL"
- For each vault: `name()`, `symbol()`, `totalAssets()` → vault preview cards

**Reads (wallet connected):**
- `stablecoin.read.balanceOf([address])` → "Your NUSD Balance"
- For each vault: `vault.read.balanceOf([address])` → `convertToAssets([shares])` → portfolio preview

### 3B. Vaults list — reads
**File:** `frontend/src/routes/vaults/+page.svelte`
**Who uses it:** Traders browsing available products
**Reads:**
- Factory enumeration: count → addresses → per-vault metadata
- Share price per vault: `totalAssets / totalSupply` (handle zero supply = $1.00)
- APY estimate: read last 2 NAV entries from oracle, annualize the rate

### 3C. Vault Detail — reads + writes (core trader flow)
**File:** `frontend/src/routes/vaults/[address]/+page.svelte`
**Who uses it:** Traders depositing/withdrawing

**Reads:** vault name, symbol, totalAssets, totalSupply, share price, user share balance, position value via `convertToAssets()`

**Deposit flow (2-step):**
1. User enters amount → live preview via `previewDeposit(amount)` (debounced)
2. Click "Deposit" → `stablecoin.write.approve([vaultAddress, amount])` → wait for confirm
3. Then `vault.write.deposit([amount, userAddress])` → wait for confirm
4. Toast success, refresh all reads

**Withdraw flow:**
1. User enters amount → preview via `previewWithdraw(amount)`
2. Click "Withdraw" → `vault.write.withdraw([amount, user, user])`

**State machine for buttons:** `idle → approving → depositing → success | error`

### 3D. Portfolio — reads
**File:** `frontend/src/routes/portfolio/+page.svelte`
**Who uses it:** Traders reviewing positions
**Reads:**
- NUSD balance
- For each factory vault with shares > 0: position value, vault name
- Total value = sum(positions) + NUSD balance
- Transaction history: `publicClient.getLogs()` for Deposit/Withdraw events (last 10k blocks)

---

## Phase 4: Admin Pages

### 4A. Admin Dashboard — reads
**File:** `frontend/src/routes/admin/+page.svelte`
**Who uses it:** DAO ops, at-a-glance system health
**Reads:**
- Reserve ratio: `reserveTracker.read.getTotalReserves()` / `stablecoin.read.totalSupply()`
- Oracle freshness: `navOracle.read.getLatestNAV()` → timestamp → "X hours ago"
- Pause status: `stablecoin.read.paused()`
- KYC count: show "—" (requires indexer, document as limitation)

### 4B. Mint Operations — reads + writes
**File:** `frontend/src/routes/admin/mint/+page.svelte`
**Who uses it:** Sales/cash onboarding
**Reads:** total NUSD supply, connected wallet's allocation/minted/remaining
**Writes:**
- Mint: `mintController.write.mint([to, amount])` — validate amount <= remaining
- Set allocation: `mintController.write.setMintAllocation([minter, ceiling])`
- Reset: `mintController.write.resetMintedAmount([minter])`
- Burn: `stablecoin.write.burn([from, amount])`

### 4C. Compliance — reads + writes
**File:** `frontend/src/routes/admin/compliance/+page.svelte`
**Who uses it:** Compliance officers

**Denylist tab:**
- Check: `restrictionList.read.isRestricted([addr])` → display status
- Write: `restrict()`, `unrestrict()`, `batchRestrict()` (textarea, one addr per line)

**KYC tab:**
- Check: `kycRegistry.read.getStatus([addr])` → { verified, expiry, verifiedAt }
- Write: `setVerified(addr, BigInt(expiryUnixTimestamp))`, `revokeVerification(addr)`

**Accreditation tab:**
- Check: `accreditedInvestor.read.isAccredited([addr])`
- Write: `setAccredited(addr, true/false)`

### 4D. Oracle — reads + writes
**File:** `frontend/src/routes/admin/oracle/+page.svelte`
**Who uses it:** DAO ops / oracle reporters
**Reads:**
- `getLatestNAV()` → total assets + timestamp
- `getHistoryLength()` → loop `getNAVAt(i)` for last 30 entries → history table
**Write:**
- `postNAV(parseNUSD(amount), BigInt(Date.now()/1000))` — auto-fills current timestamp

### 4E. Reserves — reads + writes
**File:** `frontend/src/routes/admin/reserves/+page.svelte`
**Who uses it:** Risk / reserve reporters
**Reads:**
- `getTotalReserves()` → total reserves stat
- `stablecoin.read.totalSupply()` → for ratio calculation
- `getReserveHistory()` → full history table + composition breakdown
**Write:**
- `postReserve(assetType, parseNUSD(amount))`

---

## Build Order (sequential, per user preference)

| # | Task | Files | Verify |
|---|------|-------|--------|
| 1 | Fix seed.ts for HH v3 + factory + JSON output | `scripts/seed.ts` | `npx hardhat run scripts/seed.ts`, JSON created |
| 2 | Update deploy.ts: factory + JSON output | `scripts/deploy.ts` | `npx hardhat run scripts/deploy.ts`, JSON created |
| 3 | ABI additions (previewRedeem, AccreditedInvestor, reserveHistory) | `abis.ts` | TypeScript compiles |
| 4 | Addresses module: localhost chain + JSON import | `addresses.ts` | Import resolves |
| 5 | Wallet store: walletClient + configurable RPC | `wallet.ts` | Connect wallet locally |
| 6 | Contract helpers module | `contracts/index.ts` | Import and call a read |
| 7 | Toast + TxButton components | 3 new files + layout | Visual test |
| 8 | Landing page wiring | `+page.svelte` | Real stats display |
| 9 | Vaults list wiring | `vaults/+page.svelte` | Live vault cards |
| 10 | Vault detail + deposit/withdraw | `vaults/[address]/+page.svelte` | Full deposit cycle |
| 11 | Portfolio wiring | `portfolio/+page.svelte` | Positions after deposit |
| 12 | Admin dashboard wiring | `admin/+page.svelte` | Reserve ratio + oracle time |
| 13 | Mint operations wiring | `admin/mint/+page.svelte` | Mint NUSD, supply increases |
| 14 | Compliance wiring | `admin/compliance/+page.svelte` | Restrict addr, verify |
| 15 | Oracle wiring | `admin/oracle/+page.svelte` | Post NAV, history updates |
| 16 | Reserves wiring | `admin/reserves/+page.svelte` | Post reserve, ratio updates |

## Known Limitations (document, don't fix)

- **Yield calculation** needs event indexing (The Graph/Ponder) — show position value only
- **KYC user count** on admin dashboard needs indexer — show "—"
- **No role gating** on admin pages — txs will revert if wallet lacks role, but UI doesn't hide controls
- **No charts yet** — Chart.js integration is separate work; chart placeholder areas remain
- **wagmi deps unused** — `@wagmi/core` and `@wagmi/connectors` are in package.json but we use raw viem
