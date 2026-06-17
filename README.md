# Nexus Protocol

Institutional digital asset protocol suite: tokenized treasury vaults (ERC-4626), NUSD stablecoin (UUPS upgradeable), compliance layer, and off-chain services.

**Network:** Base Sepolia (testnet) → Base Mainnet → Ethereum Mainnet
**Deployed:** 2026-04-05 | See [`docs/TESTNET_DEPLOYMENT.md`](docs/TESTNET_DEPLOYMENT.md) for contract addresses.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  SvelteKit Frontend  (frontend/)           :5173             │
│  Reads chain directly via viem + MetaMask                    │
│  Reads indexed history from Indexer API    :3001             │
└──────────────────────┬───────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼───────────────────────────────────────┐
│  Docker Compose  (docker-compose.yml)                        │
│                                                              │
│  ┌──────────────┐  ┌───────────────────────┐                 │
│  │  PostgreSQL  │  │  Event Indexer  :3001 │                 │
│  │  :5432       │◄─│  polls chain every 12s│                 │
│  │  nexus_indexer│  │  writes events to DB  │                 │
│  └──────────────┘  └───────────────────────┘                 │
│                                                              │
│  ┌───────────────────────────────────────────────────┐       │
│  │  Oracle Reporter  :3002                           │       │
│  │  reads vault.totalAssets() → posts NAV on-chain  │       │
│  │  once per day (configurable via POST_INTERVAL_MS) │       │
│  └───────────────────────────────────────────────────┘       │
│                                                              │
│  Planned services (docker-compose.yml stubs):               │
│  compliance-svc · audit-reporter · reconciler                │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│  Base Sepolia (on-chain)                                     │
│  NexusStableCoin · YieldVault · NAVOracle · MintController   │
│  ReserveTracker · KYCRegistry · RestrictionList · AuditLog   │
│  ETHSwapGateway · MockPriceFeed                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Quick Start (Local Dev)

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker Desktop | 4.x+ | Must be running before any `docker compose` command |
| Node.js | 22 LTS | Frontend and local service dev |
| MetaMask | any | Base Sepolia configured |

### 1 — Configure environment

Copy the example and fill in your values:

```bash
# Root .env (read by docker-compose.yml)
cp .env.example .env   # if it doesn't exist, create from the variables below
```

Minimum required in root `.env`:

```bash
# Reporter wallet — must hold REPORTER_ROLE on the NAVOracle contract
# For dev: reuse the deployer key (already has REPORTER_ROLE from deploy script)
REPORTER_PRIVATE_KEY=0x<your-private-key>
```

All other variables have working defaults (Base Sepolia RPC, deployed contract addresses).

### 2 — Start the full services stack

```bash
# From repo root — starts PostgreSQL + Event Indexer + Oracle Reporter
docker compose up -d

# Verify all three are healthy
docker compose ps
```

Expected output:

```
NAME                               STATUS              PORTS
nexus-protocol-postgres-1          running (healthy)   0.0.0.0:5432->5432/tcp
nexus-protocol-indexer-1           running (healthy)   0.0.0.0:3001->3001/tcp
nexus-protocol-oracle-reporter-1   running (healthy)   0.0.0.0:3002->3002/tcp
```

### 3 — Confirm services are alive

```bash
# Event indexer
curl http://localhost:3001/health
# → {"status":"ok","service":"nexus-indexer"}

# Oracle reporter
curl http://localhost:3002/health
# → {"status":"ok","service":"nexus-oracle-reporter"}

# Latest NAV in the DB (confirms full oracle → chain → indexer → API pipeline)
curl http://localhost:3001/api/nav-history?limit=1
```

### 4 — Start the frontend

```bash
cd frontend
npm install       # first time only
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### 5 — Connect MetaMask

- Network: **Base Sepolia** (chain ID 84532)
- RPC: `https://sepolia.base.org`
- Connect the deployer account `0x41521c37...` for admin access

---

## Granting the Oracle Reporter Its Role

The reporter wallet must hold `REPORTER_ROLE` on the `NAVOracle` contract.
The deploy script handles this automatically if `ORACLE_REPORTER_ADDRESS` is set:

```bash
ORACLE_REPORTER_ADDRESS=0xYourReporterWallet \
  npx hardhat run scripts/deploy.ts --network baseSepolia
```

For an existing deployment, grant the role manually (Hardhat console or script):

```javascript
const oracle = await ethers.getContractAt("NAVOracle", NAV_ORACLE_ADDRESS);
const REPORTER_ROLE = await oracle.REPORTER_ROLE();
await oracle.grantRole(REPORTER_ROLE, REPORTER_WALLET_ADDRESS);
```

---

## ETH Swap Gateway

The `ETHSwapGateway` is a protocol-owned swap desk — **not an AMM**. It mints NUSD against deposited ETH and redeems NUSD back to ETH from its reserve.

| Action | UI | Contract call |
|---|---|---|
| Buy NUSD with ETH | `/swap` → BUY NUSD | `buyNUSD(minOut)` payable |
| Sell NUSD for ETH | `/swap` → SELL NUSD | `sellNUSD(amount, minETH)` |
| Buy vault shares with ETH | Vault page → BUY ETH tab | `buyVaultShares(vault, minShares)` payable |
| Sell vault shares for ETH | Vault page → SELL ETH tab | `sellVaultShares(vault, shares, minETH)` |

**Deployed:** `0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b` (Base Sepolia)
**Price oracle:** `MockPriceFeed` at $2800 ETH/USD — update via `setPrice(newPrice)` (UPDATER_ROLE)
**ETH reserves:** 0.05 ETH seeded — top up by sending ETH to the gateway address
**Roles on NUSD:** MINTER_ROLE + BURNER_ROLE granted to gateway

To redeploy or top up reserves:
```bash
npx hardhat run scripts/setupGateway.ts --network baseSepolia
```

See `docs/OPS_GUIDE.md → Gateway Operations` for full runbook.

---

## Stopping / Resetting

```bash
# Stop all services (data preserved)
docker compose down

# Stop and wipe the database (full re-index on next start)
docker compose down -v

# Restart a single service after a code change
docker compose build oracle-reporter
docker compose up -d oracle-reporter
```

---

## Development Modes

### Option A — Full Docker (recommended for demos)

```bash
docker compose up -d        # postgres + indexer + oracle-reporter in containers
cd frontend && npm run dev
```

### Option B — Indexer on host (live code changes to indexer)

```bash
docker compose up -d postgres oracle-reporter   # DB + oracle in Docker

cd services/indexer
cp .env.example .env        # first time only
npm install
npm run start:dev            # hot-reload
```

### Option C — Oracle reporter on host (live code changes to reporter)

```bash
docker compose up -d postgres indexer           # DB + indexer in Docker

cd services/oracle-reporter
cp .env.example .env        # fill in REPORTER_PRIVATE_KEY
npm install
npm run start:dev
```

---

## Project Structure

```
nexus-protocol/
├── contracts/                 # Solidity 0.8.28
│   ├── vaults/                # ERC-4626 YieldVault, NAVOracle, YieldVaultFactory
│   ├── stablecoin/            # NexusStableCoin (UUPS), MintController, RestrictionList
│   ├── compliance/            # TransferRestrictions, KYCRegistry, AccreditedInvestor
│   ├── accounting/            # ReserveTracker, AuditLog
│   └── governance/            # NexusGovernor, NexusTimelock (OZ Governor)
│
├── services/
│   ├── indexer/               # NestJS — polls chain events → PostgreSQL  :3001
│   │   ├── src/
│   │   │   ├── config/        # env.ts, database.ts (Drizzle schema), abis.ts
│   │   │   ├── modules/
│   │   │   │   ├── events/    # events.service.ts (poller + REST)
│   │   │   │   └── health/    # GET /health
│   │   │   └── main.ts
│   │   ├── drizzle/           # SQL migrations — auto-applied by Docker on first start
│   │   ├── Dockerfile
│   │   └── .env.example
│   │
│   ├── oracle-reporter/       # NestJS — posts daily NAV to NAVOracle  :3002
│   │   ├── src/
│   │   │   ├── config/        # env.ts (AppConfig + loadConfig)
│   │   │   ├── modules/
│   │   │   │   ├── reporter/  # reporter.service.ts (mock adapter → postNAV)
│   │   │   │   └── health/    # GET /health
│   │   │   └── main.ts
│   │   ├── Dockerfile
│   │   └── .env.example       # REPORTER_PRIVATE_KEY, NAV_ORACLE_ADDRESS, etc.
│   │
│   │   # Planned services (docker-compose.yml stubs ready):
│   ├── compliance/            # Phase 3.5: KYC webhook ingestion
│   ├── audit-reporter/        # Phase 3.6: AuditLog writer
│   └── reconciler/            # Phase 3.7: reserve vs supply checks
│
├── frontend/                  # SvelteKit — investor portal + operator dashboard
│   ├── src/
│   │   ├── routes/            # +page.svelte files per route
│   │   ├── lib/
│   │   │   ├── api/           # indexer.ts — typed REST client
│   │   │   ├── contracts/     # abis.ts, addresses.ts, deployments.json
│   │   │   └── stores/        # wallet.ts (viem + MetaMask)
│   │   └── app.html
│   └── .env.local             # VITE_RPC_URL, VITE_CHAIN
│
├── scripts/
│   ├── deploy.ts              # Hardhat deploy → updates deployments.json
│   │                          # Set ORACLE_REPORTER_ADDRESS to auto-grant REPORTER_ROLE
│   ├── deployGateway.ts       # Deploy MockPriceFeed + ETHSwapGateway
│   ├── setupGateway.ts        # Grant roles + seed ETH (idempotent, safe to re-run)
│   └── seed.ts                # Deploy + seed test data (NAV, reserves, KYC)
│
├── docker-compose.yml         # Unified local services stack
├── .env                       # Root secrets (gitignored) — see .env.example
└── docs/
    ├── TESTNET_DEPLOYMENT.md  # Contract addresses + MetaMask setup
    ├── OPS_GUIDE.md           # Step-by-step ops reference (setup, monitoring, recovery)
    ├── DEVELOPER_REFERENCE.md # Types, interfaces, API contracts
    ├── PHASE_TRACKER.md       # Implementation progress
    ├── ARCHITECTURE.md        # System design
    ├── DECISIONS.md           # Architecture Decision Records
    ├── CONTRACT_REGISTRY.md   # All contracts, roles, wiring
    └── E2E_WORKFLOWS.md       # End-to-end call sequences
```

---

## Contracts

```bash
npx hardhat compile          # compile all contracts
npx hardhat test             # run 140 tests
npx hardhat coverage         # coverage report

# Deploy to Base Sepolia (updates frontend/src/lib/contracts/deployments.json)
# Optionally grant REPORTER_ROLE to oracle-reporter wallet at deploy time:
ORACLE_REPORTER_ADDRESS=0x... npx hardhat run scripts/deploy.ts --network baseSepolia
```

---

## Services API Reference

### Event Indexer — `http://localhost:3001`

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness probe |
| `GET /api/indexer-status` | Block cursors + known vaults |
| `GET /api/nav-history?vault=0x...&limit=100` | NAV history for a vault |
| `GET /api/vault-transactions?vault=0x...&owner=0x...&limit=50` | Deposit/withdrawal history |
| `GET /api/transfers?address=0x...&limit=50` | NUSD transfer history |
| `GET /api/reserve-history?limit=100` | Reserve update history |
| `GET /api/events?contract=stablecoin&event=Transfer&limit=50` | Raw event log |

### Oracle Reporter — `http://localhost:3002`

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Liveness probe — also confirms reporter wallet is configured |

The reporter has no query API — it is a write-only service. To inspect posted NAVs,
use the indexer's `/api/nav-history` endpoint or the frontend Admin → NAV Oracle page.

---

## Environment Variables

### Root `.env` (docker-compose reads these)

```bash
# Reporter wallet — must hold REPORTER_ROLE on NAVOracle
# Dev: reuse deployer key. Prod: dedicated hot wallet with REPORTER_ROLE only.
REPORTER_PRIVATE_KEY=0x<private-key>

# Override RPC if the public endpoint rate-limits you
RPC_URL=https://base-sepolia.drpc.org

# Address of the oracle-reporter wallet — used at deploy time to pre-grant REPORTER_ROLE
ORACLE_REPORTER_ADDRESS=0x<reporter-wallet-address>
```

### `services/oracle-reporter/.env` (local dev only)

```bash
RPC_URL=https://base-sepolia.drpc.org
CHAIN_ID=84532
REPORTER_PRIVATE_KEY=0x<private-key>   # wallet with REPORTER_ROLE
NAV_ORACLE_ADDRESS=0x28dc5ccc6a97675b7def7b4c4179b85127b698f3
YIELD_VAULT_ADDRESS=0x6671D7937ae8b9120A673724FD26CF06e61b4F67
PRICE_ADAPTER=mock          # mock | bloomberg | refinitiv
POST_INTERVAL_MS=86400000   # 24h default
```

### `services/indexer/.env` (local dev only — already created)

All addresses pre-filled from the Base Sepolia deployment.
Used when running the indexer outside Docker (`npm run start:dev`).

### `frontend/.env.local`

```bash
VITE_RPC_URL=https://base-sepolia.drpc.org
VITE_CHAIN=baseSepolia
VITE_INDEXER_URL=http://localhost:3001   # optional — this is the default
```

---

## Oracle Reporter — Price Adapters

The oracle reporter supports pluggable price adapters via the `PRICE_ADAPTER` env var.

| Adapter | Status | Description |
|---------|--------|-------------|
| `mock` | ✅ Live | Reads `vault.totalAssets()` on-chain. Uses 1 NUSD floor if vault is empty. |
| `bloomberg` | ⬜ Planned | Bloomberg B-PIPE integration (Phase 6) |
| `refinitiv` | ⬜ Planned | Refinitiv Eikon/Elektron integration (Phase 6) |

In production, replace `mock` with a real adapter that sources NAV from your fund administrator or prime broker. See [`docs/INTEGRATION_ROADMAP.md`](docs/INTEGRATION_ROADMAP.md) for integration plans.

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 — Contracts | ✅ Complete | 140 tests passing, gateway deployed |
| 2 — Derivatives | ⏸ Deferred | YieldSplitter done; StructuredProduct, CreditVault pending |
| 3 — Services | 🔄 In Progress | Indexer ✅ · API ✅ · Oracle Reporter ✅ · Compliance ⬜ |
| 4 — Frontend | ✅ Mostly complete | Investor portal + operator dashboard live |
| 5 — Production Hardening | ⬜ Not started | Formal verification, gas optimization |
| 6 — Institutional Integration | ⬜ Not started | Replace mock adapters with real connections |

See [`docs/PHASE_TRACKER.md`](docs/PHASE_TRACKER.md) for detailed progress.

---

## Further Reading

| Doc | Contents |
|-----|----------|
| [`docs/OPS_GUIDE.md`](docs/OPS_GUIDE.md) | Step-by-step ops: setup, monitoring, restart, DB access |
| [`docs/DEVELOPER_REFERENCE.md`](docs/DEVELOPER_REFERENCE.md) | Types, interfaces, API contracts across all layers |
| [`docs/TESTNET_DEPLOYMENT.md`](docs/TESTNET_DEPLOYMENT.md) | All deployed contract addresses |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design and contract relationships |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Architecture Decision Records (ADRs) |
| [`docs/CONTRACT_REGISTRY.md`](docs/CONTRACT_REGISTRY.md) | Contracts, roles, wiring order |
| [`docs/E2E_WORKFLOWS.md`](docs/E2E_WORKFLOWS.md) | End-to-end call sequences |
| [`docs/INTEGRATION_ROADMAP.md`](docs/INTEGRATION_ROADMAP.md) | 9 institutional integration points |

---

## Documentation & Training Material

The `docs-site/` directory contains a full MkDocs knowledge base organized by role.
It covers the protocol from four angles: what to sell, how to stay compliant, how to build on it, and how it fits into the regulatory landscape.

### Serve the docs site locally

```bash
cd docs-site
pip install -r requirements.txt   # one-time: mkdocs-material + plugins
mkdocs serve                      # → http://127.0.0.1:8000
```

### Sales & Trading — [`docs-site/docs/sales-trading/`](docs-site/docs/sales-trading/)

For sales teams, relationship managers, and investor-facing staff.

| Document | What it covers |
|----------|---------------|
| [Overview](docs-site/docs/sales-trading/index.md) | Protocol positioning, target segments, and revenue model |
| [Product Catalog](docs-site/docs/sales-trading/products.md) | All live and planned products: NUSD, nxTREASURY vault, PT/YT, Credit Vault, ETF Wrapper |
| [Yield Strategies](docs-site/docs/sales-trading/yield-strategies.md) | T-bill yield pass-through, yield stripping mechanics, tranching, and credit strategies |
| [Pricing & NAV](docs-site/docs/sales-trading/pricing.md) | How NAV is calculated and published, vault share pricing, and NUSD peg mechanics |
| [Client Pitches](docs-site/docs/sales-trading/client-pitches.md) | Objection handling, competitive positioning, and sample talking points by client type |

### Compliance — [`docs-site/docs/compliance/`](docs-site/docs/compliance/)

For compliance officers, legal counsel, and operations staff managing regulated flows.

| Document | What it covers |
|----------|---------------|
| [Overview](docs-site/docs/compliance/index.md) | On-chain compliance architecture and the role of each control |
| [Access Control & Roles](docs-site/docs/compliance/access-control.md) | Every `AccessControl` role across all contracts, who holds it, and what it grants |
| [KYC & AML](docs-site/docs/compliance/kyc-aml.md) | KYCRegistry and AccreditedInvestor contracts, onboarding flow, and verification lifecycle |
| [Transfer Restrictions](docs-site/docs/compliance/transfer-restrictions.md) | RestrictionList (denylist) + TransferRestrictions gate, how they compose on vault and stablecoin transfers |
| [Audit Trail](docs-site/docs/compliance/audit-trail.md) | AuditLog contract, what gets logged, and how to query the immutable on-chain record |
| [Regulatory Controls](docs-site/docs/compliance/regulatory-controls.md) | Pause, denylist, UUPS upgradeability, and sanctions screening runbook |

### Developers — [`docs-site/docs/developers/`](docs-site/docs/developers/)

For engineers integrating with or extending the protocol.

| Document | What it covers |
|----------|---------------|
| [Overview](docs-site/docs/developers/index.md) | Tech stack, repo layout, and how the layers connect |
| [Architecture](docs-site/docs/developers/architecture.md) | Contract interaction diagrams, data flow, and service dependencies |
| [Contract Reference](docs-site/docs/developers/contracts-reference.md) | Every public function, event, and error across all contracts |
| [Deployment Guide](docs-site/docs/developers/deployment-guide.md) | Step-by-step deploy to Base Sepolia and mainnet, gas table, nonce pitfalls |
| [Integration Guide](docs-site/docs/developers/integration-guide.md) | How to integrate NUSD, vaults, and compliance hooks into external systems |
| [Testing](docs-site/docs/developers/testing.md) | Test layout, how to run coverage, fork-testing patterns |
| [API Reference](docs-site/docs/developers/api-reference.md) | Full REST spec for the Event Indexer and Oracle Reporter services |

### Legal & Regulatory — [`docs-site/docs/legal-regulatory/`](docs-site/docs/legal-regulatory/)

For legal teams, auditors, and institutional counterparties conducting due diligence.

| Document | What it covers |
|----------|---------------|
| [Overview](docs-site/docs/legal-regulatory/index.md) | Regulatory positioning and jurisdiction considerations |
| [Token Classification](docs-site/docs/legal-regulatory/token-classification.md) | How NUSD and vault shares are characterized under US and EU frameworks |
| [Smart Contract Risks](docs-site/docs/legal-regulatory/smart-contract-risks.md) | Disclosed risks, upgrade mechanism, and admin key controls |
| [Reserve Transparency](docs-site/docs/legal-regulatory/reserve-transparency.md) | On-chain reserve proofs, ReserveTracker contract, and attestation model |
| [Governance](docs-site/docs/legal-regulatory/governance.md) | NexusGovernor + Timelock architecture, proposal lifecycle, and veto rights |

### Engineering Reference — [`docs/`](docs/)

Internal working documents for the engineering and operations team.

| Document | What it covers |
|----------|---------------|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, contract relationships, and layering principles |
| [`BUSINESS_PLAN.md`](docs/BUSINESS_PLAN.md) | Commercial model, target markets, and go-to-market roadmap |
| [`CONTRACT_REGISTRY.md`](docs/CONTRACT_REGISTRY.md) | All deployed addresses, roles held, and wiring order |
| [`DERIVATIVES_PLAN.md`](docs/DERIVATIVES_PLAN.md) | Phase 2 derivatives design: PT/YT splitting, Credit Vault, ETF Wrapper |
| [`DEVELOPER_REFERENCE.md`](docs/DEVELOPER_REFERENCE.md) | Canonical type definitions, interfaces, and cross-layer API contracts |
| [`E2E_WORKFLOWS.md`](docs/E2E_WORKFLOWS.md) | 7 end-to-end call sequences with exact function signatures and expected state |
| [`INTEGRATION_ROADMAP.md`](docs/INTEGRATION_ROADMAP.md) | 9 institutional integration points with partner research and next steps |
| [`OPS_GUIDE.md`](docs/OPS_GUIDE.md) | Production runbook: startup, monitoring, recovery, DB access |
| [`PHASE_TRACKER.md`](docs/PHASE_TRACKER.md) | Granular implementation progress across all phases |
| [`TESTING_GUIDE.md`](docs/TESTING_GUIDE.md) | Test strategy, coverage targets, and how to run the full suite |
