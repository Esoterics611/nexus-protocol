# Nexus Protocol — Phase Tracker

> Last updated: 2026-04-06 (session 5 — Phase 2 deployment + indexer derivatives wiring)

## Phase 1: Foundation (COMPLETE)
**Goal:** Core vault + stablecoin contracts, compilable, tested, and deployed

### Contracts Status
| Contract | Status | Tests | Notes |
|----------|--------|-------|-------|
| `vaults/NAVOracle.sol` | ✅ | ✅ 7 tests | Trusted reporter NAV oracle |
| `vaults/YieldVault.sol` | ✅ | ✅ 8 tests | ERC-4626 vault with oracle integration |
| `vaults/YieldVaultFactory.sol` | ✅ | ✅ 7 tests | Factory + registry |
| `vaults/YieldDistributor.sol` | ✅ | ✅ 8 tests | Streaming yield distribution |
| `vaults/ITransferRestrictions.sol` | ✅ | — | Interface |
| `stablecoin/NexusStableCoin.sol` | ✅ | ✅ 11 tests | UUPS + ERC-20, 6 decimals |
| `stablecoin/MintController.sol` | ✅ | ✅ 8 tests | Two-tier mint allocation |
| `stablecoin/RestrictionList.sol` | ✅ | ✅ 6 tests | Shared denylist |
| `compliance/TransferRestrictions.sol` | ✅ | ✅ 10 tests | Denylist + KYC checks |
| `compliance/KYCRegistry.sol` | ✅ | ✅ 8 tests | KYC status + expiry |
| `compliance/AccreditedInvestor.sol` | ✅ | ✅ 6 tests | Accreditation tracking |
| `accounting/ReserveTracker.sol` | ✅ | ✅ 7 tests | Reserve composition tracking |
| `accounting/AuditLog.sol` | ✅ | ✅ 4 tests | Immutable event log |
| `governance/NexusGovernor.sol` | ✅ | ⬜ TODO | OZ Governor + Timelock |
| `governance/NexusTimelock.sol` | ✅ | ⬜ TODO | TimelockController |

**Total: 102 tests passing** (Phase 1 only)

### Infrastructure
- ✅ Hardhat v3 + OZ v5.6.1 + Cancun EVM
- ✅ Full documentation suite (ARCHITECTURE, DECISIONS, CONTRACT_REGISTRY, etc.)
- ✅ Deploy script + Base Sepolia deployment (12 contracts)
- ✅ See `docs/TESTNET_DEPLOYMENT.md` for addresses

---

## Phase 4: Frontend (MOSTLY COMPLETE)
**Goal:** SvelteKit investor portal + operator dashboard

### Contract Reads — DONE
- ✅ Landing page: total supply, TVL, vault count, user NUSD balance
- ✅ Vault directory: vault count, addresses, names, symbols, TVL, user positions
- ✅ Vault detail: share price, total assets, user shares/value, deposit/withdraw preview
- ✅ Portfolio: NUSD balance, all vault positions with values
- ✅ Admin dashboard: reserve ratio, oracle freshness, pause status
- ✅ Mint page: allocation ceiling, minted, remaining, total supply
- ✅ Oracle page: latest NAV, full history
- ✅ Reserves page: total reserves, history, reserve ratio
- ✅ Compliance page: denylist check, KYC status, accreditation status

### Contract Writes — DONE
- ✅ Vault deposit (approve + deposit) and withdraw
- ✅ Mint NUSD via MintController
- ✅ Burn NUSD via stablecoin
- ✅ Set allocation + reset minted amount
- ✅ NAV oracle posting
- ✅ Reserve posting
- ✅ KYC set/revoke/batch
- ✅ Accreditation set/batch
- ✅ Denylist restrict/unrestrict/batch

### TODO — UX Polish
- ✅ NAV history table on vault detail (wired to indexer)
- ✅ Transaction history on portfolio page (wired to indexer)
- ✅ Reserve composition progress bars (pure CSS)
- ✅ Text color readability improvements (muted: #555→#999, muted-dim: #333→#666)
- ✅ StatCard accent left-border
- ✅ TxButton: smart revert message parsing (custom errors, reason strings)
- ✅ Real-time polling on all pages (12s for vault/vaults/portfolio, 30s for admin)
- ✅ Indexer offline detection — suppresses console spam when indexer down

### Frontend Bugs Fixed (session 2)
- ✅ Vault detail: `entry.blockTimestamp` → `entry.reportedTimestamp` (wrong field, nav timestamps blank)
- ✅ Landing page: `sharePrice()` hardcoded `$1.0000` → now computes from `totalAssets/totalSupply`
- ✅ Mint page: `handleSetAllocation` didn't reload allocation stats after success
- ✅ Admin dashboard: oracle age showing "19675d ago" when no NAV posted (timestamp=0 case)
- ✅ Oracle page: same timestamp=0 bug in `ageStr()`
- ✅ Admin dashboard: static timestamp in header now updates on each poll

### TODO — Remaining UX
- ⬜ Mobile responsive adjustments
- ⬜ Loading skeletons / better loading states
- ⬜ Toast notifications for successful transactions (currently only errors get toasts)
- ⬜ Wallet disconnect button / account switcher in header
- ⬜ Error boundary for failed contract reads (currently silently shows stale/empty data)

---

## Phase 3: Services Layer (IN PROGRESS)
**Goal:** Off-chain operating platform (NestJS microservices)

### Priority Order
1. ✅ **Event indexer** — NestJS service, PostgreSQL schema, polling loop, dynamic vault discovery
   - ✅ Bug fixed: `processLogs` index mismatch (`rawLogs[i]` didn't map to `parsed[i]`)
   - ✅ Bug fixed: No idempotency — added unique constraints + `onConflictDoNothing()` on all tables
   - ✅ Bug fixed: `START_BLOCK=0` (would scan from genesis) → `39778000` (deployment block)
   - ✅ Bug fixed: `NAVUpdated` hardcoded single vault → now resolves from `knownVaults` table
   - ✅ `.env` file created (was missing — only `.env.example` existed)
2. ✅ **API gateway** — REST endpoints: `/api/nav-history`, `/api/vault-transactions`, `/api/transfers`, `/api/reserve-history`, `/api/events`, `/api/indexer-status`
3. ✅ **Frontend API client** — `src/lib/api/indexer.ts` with typed wrappers
   - ✅ Added `indexerOnline` flag — pages skip polling when indexer is known offline (prevents console spam)
4. ✅ **Oracle reporter service** — Automated NAV posting from trusted data sources
   - ✅ NestJS service at `services/oracle-reporter/` (mirrors indexer structure)
   - ✅ Mock price adapter: reads `vault.totalAssets()` on-chain; falls back to 1 NUSD if vault is empty
   - ✅ Configurable `POST_INTERVAL_MS` (default 24h); posts once on startup then on interval
   - ✅ `REPORTER_PRIVATE_KEY` env var — wallet must hold `REPORTER_ROLE` on NAVOracle
   - ✅ Health endpoint at `:3002/health`
   - ✅ Dockerfile (multi-stage, node:22-alpine), `.env.example`, docker-compose.yml block uncommented
   - ⚠️ Docker build pending Docker Desktop launch: `docker compose build oracle-reporter && docker compose up -d oracle-reporter`
   - ⚠️ Deployer must grant REPORTER_ROLE: `NAVOracle.grantRole(REPORTER_ROLE, <reporter wallet>)`
5. ⬜ **Compliance service** — KYC webhook integration, accreditation workflows
6. ⬜ **Audit reporter** — Automated audit log entries for compliance events
7. ⬜ **Reconciliation service** — Reserve vs on-chain supply checks
8. ⬜ **Integration adapter interfaces** — Mock adapters for dev, real for prod

### Running the Services Stack
```bash
# From repo root — starts PostgreSQL + indexer together:
docker compose up -d

# OR: just postgres (run indexer on host with hot-reload):
docker compose up -d postgres
cd services/indexer && npm run start:dev
```

### Docker Build Fixes (session 3)
- ✅ `PublicClient` type annotation incompatible with OP Stack generics → `private client!: any`
- ✅ `BigInt` serialization error on all API endpoints → `BigInt.prototype.toJSON` patch in `main.ts`
- ✅ Removed unused `and` import from drizzle-orm in events.service.ts

### New Docs (session 3)
- ✅ `docs/OPS_GUIDE.md` — step-by-step ops reference (setup, monitoring, troubleshooting)
- ✅ `docs/DEVELOPER_REFERENCE.md` — types, interfaces, data structures across all layers
- ✅ `docs/DEVELOPER_DOCS_ROADMAP.md` — 8 planned doc deliverables with session prompts
- ✅ `docs/DERIVATIVES_PLAN.md` — Phase 2 architecture, implementation plan, session prompts

### Docker Files
- `docker-compose.yml` — **root-level unified compose** (postgres + indexer + future services stubs)
- `services/indexer/Dockerfile` — multi-stage build (builder → production alpine image)
- `services/indexer/.dockerignore` — excludes node_modules, dist, .env
- `services/indexer/docker-compose.yml` — **deprecated**, postgres-only, kept for reference

### Tech Stack
- NestJS microservices
- PostgreSQL 16 (Docker)
- Drizzle ORM — schema in `src/config/database.ts`, migrations applied by Docker on first start
- Viem for on-chain event fetching

---

## Phase 2: Derivatives (IN PROGRESS)
**Goal:** Yield splitting and structured products built on top of ERC-4626 vaults

> No services need to be completed first. Derivatives are Solidity contracts that
> compose on top of the existing Phase 1 vault + stablecoin infrastructure.
> See `docs/DERIVATIVES_PLAN.md` for full architecture, session prompts, and dev docs.

### Step 1: YieldSplitter (COMPLETE — session 4)
| Contract | Status | Tests | Notes |
|----------|--------|-------|-------|
| `derivatives/PrincipalToken.sol` | ✅ | ✅ | ERC-20, MINTER_ROLE, 6 decimals, immutable maturity |
| `derivatives/YieldToken.sol` | ✅ | ✅ | ERC-20, MINTER_ROLE, addYield by splitter only, claimYield |
| `derivatives/YieldSplitter.sol` | ✅ | ✅ 26 tests | split/unsplit/distributeYield/redeemPT/redeemYT |

**Key design decisions:**
- Yield accounting via `vault.convertToAssets()` — tracks NAV delta between distributions
- `distributeYield()` redeems vault shares for underlying, sends to YT contract
- PT redemption is pro-rata of available assets (accounts for yield already distributed)
- YT redemption gets excess above PT claims after settlement
- Address prediction via `getContractAddress()` to resolve YT↔Splitter circular dependency

### Contracts Remaining
- ⬜ `StructuredProduct.sol` — tranches (senior/junior) backed by vault collateral
- ⬜ `CreditVault.sol` — collateralized lending against vault positions
- ⬜ `ETFWrapper.sol` — multi-vault basket product

### Services Impact
After derivatives contracts are deployed:
- ⬜ Indexer: add new event sources for PT/YT/StructuredProduct contracts
- ⬜ Frontend: add derivatives pages (splitter UI, tranche viewer, credit vault)
- ⬜ API: add endpoints for PT/YT history, tranche state

---

## Phase 4.5: E2E Testing & Data Seeding (PLANNED)
**Goal:** Playwright test suite operating 10 real Base Sepolia wallets through the frontend

> Full plan in `docs/TESTING_PLAN.md`. Session prompt at the bottom of that file.
> Use Claude Sonnet to build this.

### Architecture
- Injected `window.ethereum` mock (no MetaMask extension needed)
- 10 HD wallets derived from one mnemonic (BIP-44)
- Real Base Sepolia transactions — generates authentic on-chain test data
- `tests/e2e/` inside this repo (separate `package.json`)

### Status
- ⬜ Wallet generation script (`wallets/generate.ts`)
- ⬜ Wallet seeder (`wallets/seed.ts`) — KYC + NUSD funding
- ⬜ EIP-1193 provider injection fixture
- ⬜ 10 test scenarios (connect → mint → deposit → withdraw → compliance → admin)
- ⬜ Bulk data generator (50+ operations for demo data)

---

## Phase 5: Production Hardening (NOT STARTED)
**Goal:** Formal verification, gas optimization, mainnet deploy

## Phase 6: Institutional Integration (NOT STARTED)
**Goal:** Replace mock adapters with real connections
See `INTEGRATION_ROADMAP.md` for full partner research and next steps.
