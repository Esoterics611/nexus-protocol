# Nexus Protocol — Operations Guide

> For engineers and ops staff responsible for running and supporting the off-chain services stack.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [First-Time Setup (from scratch)](#2-first-time-setup-from-scratch)
3. [Daily Operations](#3-daily-operations)
4. [Monitoring](#4-monitoring)
5. [Restart & Recovery Procedures](#5-restart--recovery-procedures)
6. [Database Access](#6-database-access)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Troubleshooting](#8-troubleshooting)
9. [Future Services](#9-future-services)

---

## 1. Prerequisites

> **Services currently running:** PostgreSQL · Event Indexer (`:3001`) · Oracle Reporter (`:3002`)
> All three start with a single `docker compose up -d` from the repo root.

Install these before anything else:

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | https://docs.docker.com/desktop/ |
| Node.js | 22.x LTS | https://nodejs.org/ |
| Git | any | https://git-scm.com/ |

**Verify Docker is running** before any `docker compose` command:

```powershell
docker info   # must succeed — if it fails, open Docker Desktop first
```

---

## 2. First-Time Setup (from scratch)

### Step 1 — Clone the repo

```bash
git clone <repo-url>
cd nexus-protocol
```

### Step 2 — Create environment files

The root `.env` is read by `docker-compose.yml` and is the single source of truth for all container secrets.

```bash
# Root .env — required for oracle-reporter
# (indexer and postgres use hardcoded defaults in docker-compose.yml)
```

Add the following to the root `.env` (create it if it doesn't exist):

```bash
# Reporter wallet — must hold REPORTER_ROLE on the NAVOracle contract
# Dev: reuse deployer key (already has REPORTER_ROLE from deploy script)
# Prod: dedicated hot wallet with only REPORTER_ROLE granted
REPORTER_PRIVATE_KEY=0x<your-private-key>
```

For running services outside Docker (hot-reload dev), also copy the indexer example:

```bash
cp services/indexer/.env.example services/indexer/.env
cp services/oracle-reporter/.env.example services/oracle-reporter/.env
# Then fill in REPORTER_PRIVATE_KEY in services/oracle-reporter/.env
```

The defaults in both `.env.example` files point to the Base Sepolia testnet deployment and the public drpc.org RPC. For production use a private RPC endpoint (Alchemy / Infura / Coinbase Cloud).

### Step 3 — Start Docker Desktop

Open Docker Desktop and wait for the whale icon to show "running" before continuing.

### Step 4 — Build and start all services

```bash
# From the repo root:
docker compose up -d
```

This command:
- Builds the indexer Docker image (first run takes ~60–90 seconds)
- Creates a PostgreSQL 16 container with the schema pre-loaded
- Starts the indexer, which waits for postgres to be healthy before connecting

### Step 5 — Verify everything is up

```bash
docker compose ps
```

Expected output:
```
NAME                               STATUS              PORTS
nexus-protocol-postgres-1          running (healthy)   0.0.0.0:5432->5432/tcp
nexus-protocol-indexer-1           running (healthy)   0.0.0.0:3001->3001/tcp
nexus-protocol-oracle-reporter-1   running (healthy)   0.0.0.0:3002->3002/tcp
```

All three should show **running (healthy)** before the indexer starts polling.

### Step 6 — Confirm services are alive

```bash
# Event indexer
curl http://localhost:3001/health
# → {"status":"ok","service":"nexus-indexer"}

curl http://localhost:3001/api/indexer-status
# → {"cursors":[...], "vaults":[...]}

# Oracle reporter
curl http://localhost:3002/health
# → {"status":"ok","service":"nexus-oracle-reporter"}
```

The oracle reporter also logs its startup NAV post. Check:

```bash
docker compose logs oracle-reporter --tail=20
```

You should see lines like:
```
[ReporterService] Oracle reporter initialized — adapter: mock, interval: 86400000ms, reporter: 0x41521c...
[ReporterService] Mock NAV from vault.totalAssets(): 91000000000000
[ReporterService] Posting NAV — totalAssets: 91000000000000, timestamp: 1775460785
[ReporterService] NAV posted — tx: 0xa524dd...
[ReporterService] NAV confirmed — block: 39846250
```

To confirm the full pipeline (oracle → chain → indexer → API):

```bash
curl "http://localhost:3001/api/nav-history?limit=1"
# Reporter address should match REPORTER_PRIVATE_KEY wallet
```

### Step 7 — Start the frontend (optional, dev only)

```bash
cd frontend
npm install
npm run dev
```

Frontend opens at http://localhost:5173

---

## 3. Daily Operations

### Start the stack

```bash
cd /path/to/nexus-protocol
docker compose up -d
```

### Stop the stack

```bash
docker compose down
# Data is preserved in the pgdata Docker volume
```

### Stop and wipe all data (DESTRUCTIVE — dev only)

```bash
docker compose down -v
# -v removes the pgdata volume; next start will re-index from START_BLOCK
```

### View live logs

```bash
# All services
docker compose logs -f

# Just the indexer
docker compose logs -f indexer

# Just postgres
docker compose logs -f postgres
```

### Check container status

```bash
docker compose ps
```

### Restart a single service

```bash
docker compose restart indexer
docker compose restart postgres
```

---

## 4. Monitoring

### Indexer health endpoint

```bash
curl http://localhost:3001/health
```

Returns `{"status":"ok"}` when the NestJS app is up. Returns an error or connection refused if the service is down.

### Indexer status endpoint

```bash
curl http://localhost:3001/api/indexer-status
```

Returns the current indexing cursor per contract source — use this to see how far behind the indexer is.

### Useful log patterns to watch

```bash
# Watch for successful polling cycles
docker compose logs -f indexer | grep "events"

# Watch for poll errors (RPC timeouts, DB connection issues)
docker compose logs -f indexer | grep -i "error\|failed\|warn"

# Watch postgres connection events
docker compose logs -f postgres | grep -i "connection\|error"
```

### What a healthy indexer looks like in logs

Every ~12 seconds you should see lines like:
```
[EventsService] stablecoin: +2 events (39820001-39830000)
[EventsService] navOracle: +1 events (39820001-39830000)
```

When caught up to chain tip, you'll see fewer lines (most 10k-block chunks will have 0 events). That's normal — the indexer only logs when it finds events.

### Signs of trouble

| Symptom | Likely Cause |
|---------|-------------|
| `Poll failed: fetch failed` repeated every 12s | RPC endpoint is down or rate-limiting |
| `Connection refused` on port 3001 | Indexer container crashed — check `docker compose logs indexer` |
| Postgres healthcheck failing | Disk full, or container OOM killed |
| Frontend shows "indexer offline" badge | Port 3001 not reachable from browser; check container status |

---

## 5. Restart & Recovery Procedures

### Indexer crashed — restart it

```bash
docker compose restart indexer
```

The indexer resumes from its last saved cursor in the `indexer_cursor` table — no events are lost or double-counted (idempotent inserts).

### Postgres crashed — restart it

```bash
docker compose restart postgres
# Indexer will reconnect automatically once postgres is healthy
```

### Full stack restart

```bash
docker compose down
docker compose up -d
```

### Indexer stuck / lagging far behind

The indexer scans in 10,000-block chunks. On first boot with `START_BLOCK=39778000` it will need to scan ~30–50k blocks to catch up. This takes 1–3 minutes over a public RPC. If it's been offline for days, it may take longer. Monitor with:

```bash
docker compose logs -f indexer | grep "events"
```

It will catch up automatically.

### Rebuild after code changes

```bash
docker compose build indexer
docker compose up -d
```

The `--build` flag on `up` also works:

```bash
docker compose up -d --build
```

### Reset the database and re-index from scratch

Only do this intentionally — all indexed event data will be lost:

```bash
docker compose down -v          # removes pgdata volume
docker compose up -d            # postgres recreates schema, indexer re-indexes from START_BLOCK
```

---

## 6. Database Access

### Connect via psql (inside the container)

```bash
docker exec -it nexus-protocol-postgres-1 psql -U nexus -d nexus_indexer
```

### Connect with an external client (DBeaver, TablePlus, etc.)

```
Host:     localhost
Port:     5432
Database: nexus_indexer
User:     nexus
Password: nexus
```

### Useful queries

```sql
-- Check indexing progress per contract source
SELECT source, last_block, updated_at FROM indexer_cursor ORDER BY source;

-- Count indexed events by contract
SELECT contract_name, COUNT(*) FROM indexed_events GROUP BY contract_name ORDER BY contract_name;

-- Recent NAV history
SELECT vault_address, total_assets, reported_timestamp, block_number
FROM nav_history ORDER BY block_number DESC LIMIT 10;

-- Recent stablecoin transfers
SELECT "from", "to", value, block_timestamp
FROM stablecoin_transfers ORDER BY block_number DESC LIMIT 10;

-- Recent reserve updates
SELECT asset_type, amount, reporter, block_timestamp
FROM reserve_updates ORDER BY block_number DESC LIMIT 10;

-- Registered vaults
SELECT * FROM known_vaults;
```

### Schema location

The full schema is in `services/indexer/drizzle/0001_initial.sql` — applied automatically by Docker on first boot via `docker-entrypoint-initdb.d`.

---

## 7. Environment Variables Reference

Set in `services/indexer/.env`. All values below are the Base Sepolia testnet defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://nexus:nexus@localhost:5432/nexus_indexer` | Postgres connection string. In Docker the host should be `postgres` not `localhost`. |
| `RPC_URL` | `https://base-sepolia.drpc.org` | JSON-RPC endpoint. Replace with a private endpoint in production. |
| `CHAIN_ID` | `84532` | Base Sepolia. Use `8453` for Base Mainnet. |
| `POLL_INTERVAL_MS` | `12000` | How often the indexer polls (matches Base block time). |
| `START_BLOCK` | `39778000` | Block to start indexing from. Set to the deployment block. |
| `STABLECOIN_ADDRESS` | `0x8267...` | NexusStableCoin proxy address |
| `MINT_CONTROLLER_ADDRESS` | `0xee9b...` | MintController address |
| `NAV_ORACLE_ADDRESS` | `0x28dc...` | NAVOracle address |
| `VAULT_FACTORY_ADDRESS` | `0x7802...` | YieldVaultFactory address |
| `YIELD_VAULT_ADDRESS` | `0x6671...` | Initial YieldVault address (seeded into known_vaults) |
| `RESERVE_TRACKER_ADDRESS` | `0x9e9a...` | ReserveTracker address |
| `AUDIT_LOG_ADDRESS` | `0xbf2f...` | AuditLog address |
| `RESTRICTION_LIST_ADDRESS` | `0xea1e...` | RestrictionList address |
| `KYC_REGISTRY_ADDRESS` | `0xadac...` | KYCRegistry address |
| `ACCREDITED_INVESTOR_ADDRESS` | `0xd30f...` | AccreditedInvestor address |
| `TRANSFER_RESTRICTIONS_ADDRESS` | `0xbaa4...` | TransferRestrictions address |

**Note:** The Docker compose file passes all these as environment variables directly — the containerised indexer does not read from the `.env` file. The `.env` file is only used when running `npm run start:dev` locally.

---

## 8. Troubleshooting

### `docker compose up -d` fails immediately

**"Cannot connect to the Docker daemon"**
→ Docker Desktop is not running. Open it and wait for the whale icon.

**"port is already allocated"**
→ Something else is using port 5432 or 3001. Stop the conflicting service, or change the port in `docker-compose.yml`.

### Indexer logs show repeated `Poll failed`

Check that the RPC endpoint is reachable:
```bash
curl -X POST https://base-sepolia.drpc.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

If this fails, the public RPC may be rate-limiting or down. Switch to a private RPC endpoint in `.env` / `docker-compose.yml`.

### `localhost:3001` returns connection refused

```bash
# Check if the container is running
docker compose ps

# If it's restarting, look at why
docker compose logs indexer --tail=50
```

Common causes:
- Postgres wasn't healthy when the indexer tried to connect (rare with healthcheck in place)
- A TypeScript/Node crash — look for a stack trace in the logs

### Database schema is missing or wrong

This happens if postgres was started before the schema SQL was mounted:
```bash
docker compose down -v    # wipe the volume
docker compose up -d      # postgres re-runs the init script
```

### Indexer is not picking up events from a new vault

New vaults deployed after the indexer started are auto-discovered via `VaultCreated` events from the VaultFactory. If you deployed a vault manually (not through the factory), add it to the `known_vaults` table directly:

```sql
INSERT INTO known_vaults (address) VALUES ('0xYourVaultAddress');
```

Then restart the indexer so it picks up the new source.

---

## 9. Future Services

The following services are stubbed in `docker-compose.yml` but not yet implemented. When each service is ready, uncomment its block and add its build context.

| Service | Phase | Description |
|---------|-------|-------------|
| `oracle-reporter` | 3.4 | Posts daily NAV to the NAVOracle contract from a price source |
| `compliance-svc` | 3.5 | KYC webhook ingestion and accreditation workflows |
| `audit-reporter` | 3.6 | Writes AuditLog entries for compliance events |
| `reconciler` | 3.7 | Checks on-chain reserves vs NUSD supply; alerts on drift |

Each future service will:
1. Share the same PostgreSQL instance (`nexus_indexer` database)
2. Connect on the `nexus` Docker network
3. Be configurable via environment variables in `docker-compose.yml`
4. Follow the same ops patterns: `docker compose restart <service>`, `docker compose logs -f <service>`

---

## Gateway Operations

> **ETHSwapGateway** — protocol-owned swap desk. Mints NUSD against ETH at the `MockPriceFeed` oracle price; redeems NUSD back to ETH from the contract's ETH reserve. No AMM, no LP tokens.

### Deployed addresses (Base Sepolia)

| Contract | Address |
|---|---|
| MockPriceFeed | `0xf6752cf9665db80a396073c66ac8df4b4b5327be` |
| ETHSwapGateway | `0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b` |

Roles granted on NexusStableCoin: `MINTER_ROLE` + `BURNER_ROLE` held by gateway.

---

### Updating the oracle price

The `MockPriceFeed` price is admin-settable. Only addresses with `UPDATER_ROLE` (deployer by default) can call `setPrice`.

```bash
# Via Hardhat console (baseSepolia)
npx hardhat console --network baseSepolia
```

```ts
const feed = await hre.viem.getContractAt(
  "MockPriceFeed",
  "0xf6752cf9665db80a396073c66ac8df4b4b5327be"
);
// Set ETH/USD to $3100 (8 decimals)
await feed.write.setPrice([310_000_000_000n]);
```

Price takes effect immediately on the next swap — no restart needed.

---

### ETH reserve management

The gateway holds ETH to fund NUSD redemptions. Monitor and top up as needed.

```bash
# Check current reserve balance
cast balance 0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b --rpc-url https://base-sepolia.drpc.org
```

**Top up reserves** — send ETH directly to the gateway address (the `receive()` fallback accepts it):

```bash
cast send 0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b \
  --value 0.1ether \
  --private-key $DEPLOYER_KEY \
  --rpc-url https://base-sepolia.drpc.org
```

Or re-run the setup script (idempotent, only seeds if balance < 0.05 ETH):

```bash
npx hardhat run scripts/setupGateway.ts --network baseSepolia
```

**Withdraw reserves** (OPERATOR_ROLE required):

```ts
const gw = await hre.viem.getContractAt("ETHSwapGateway", "0xd4ffdd...");
await gw.write.withdrawETH([parseEther("0.05"), recipientAddress]);
```

---

### Re-deploying the gateway

If you need to redeploy (e.g. after a contract upgrade):

```bash
# 1. Deploy fresh contracts
npx hardhat run scripts/deployGateway.ts --network baseSepolia

# 2. Paste new addresses into:
#    - frontend/src/lib/contracts/deployments.json  (priceFeed + swapGateway)
#    - docs/CONTRACT_REGISTRY.md

# 3. Grant roles and seed ETH (idempotent)
npx hardhat run scripts/setupGateway.ts --network baseSepolia
```

---

### Troubleshooting: common gateway errors

| Error | Cause | Fix |
|---|---|---|
| `ZeroAmount` | Sent 0 ETH or 0 NUSD | Ensure input > 0 |
| `SlippageExceeded` | Price moved between quote and tx | Retry or widen slippage tolerance |
| `InsufficientETHReserves` | Gateway ETH balance too low | Top up reserves (see above) |
| `InvalidPrice` | Oracle returned ≤ 0 | Call `setPrice` on MockPriceFeed |
| `AccessControlUnauthorizedAccount` on grantRole | Gateway doesn't have MINTER/BURNER | Re-run `setupGateway.ts` |

---

## Quick Reference Card

```bash
# Start everything
docker compose up -d

# Stop everything (data preserved)
docker compose down

# View live logs
docker compose logs -f indexer

# Check health
curl http://localhost:3001/health

# Check indexing status
curl http://localhost:3001/api/indexer-status

# Access database
docker exec -it nexus-protocol-postgres-1 psql -U nexus -d nexus_indexer

# Rebuild after code change
docker compose build indexer && docker compose up -d

# Full reset (destroys all indexed data)
docker compose down -v && docker compose up -d
```
