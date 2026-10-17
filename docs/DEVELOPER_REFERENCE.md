# Nexus Protocol — Developer Technical Reference

> Types, interfaces, data structures, and API contracts across the full stack.
> Start here before reading source files.

---

## Table of Contents

1. [System Layers](#1-system-layers)
2. [Indexer Service — Types & Interfaces](#2-indexer-service--types--interfaces)
   - [Configuration](#21-configuration)
   - [Database Schema](#22-database-schema)
   - [REST API](#23-rest-api)
   - [Internal Types](#24-internal-types)
3. [Frontend API Client — Types](#3-frontend-api-client--types)
4. [Smart Contract Interfaces](#4-smart-contract-interfaces)
5. [Data Flow & Type Mapping](#5-data-flow--type-mapping)
6. [BigInt Handling Conventions](#6-bigint-handling-conventions)
7. [Address Conventions](#7-address-conventions)

---

## 1. System Layers

```
┌─────────────────────────────────────────────────────┐
│  Base Sepolia (EVM)                                 │
│  Solidity contracts — on-chain source of truth      │
└────────────────────┬────────────────────────────────┘
                     │ viem getLogs + parseEventLogs
┌────────────────────▼────────────────────────────────┐
│  Indexer (NestJS · TypeScript)                      │
│  Polls chain every 12s → writes to PostgreSQL       │
│  Exposes REST API on :3001                          │
└────────────────────┬────────────────────────────────┘
                     │ HTTP fetch
┌────────────────────▼────────────────────────────────┐
│  Frontend (SvelteKit · TypeScript)                  │
│  Reads from both on-chain (viem) and indexer (REST) │
└─────────────────────────────────────────────────────┘
```

---

## 2. Indexer Service — Types & Interfaces

### 2.1 Configuration

**File:** `services/indexer/src/config/env.ts`

```typescript
interface AppConfig {
  databaseUrl: string;
  rpcUrl: string;
  chainId: number;
  pollIntervalMs: number;
  startBlock: bigint;
  contracts: {
    stablecoin: `0x${string}`;
    mintController: `0x${string}`;
    navOracle: `0x${string}`;
    vaultFactory: `0x${string}`;
    yieldVault: `0x${string}`;
    reserveTracker: `0x${string}`;
    auditLog: `0x${string}`;
    restrictionList: `0x${string}`;
    kycRegistry: `0x${string}`;
    accreditedInvestor: `0x${string}`;
    transferRestrictions: `0x${string}`;
  };
}
```

Loaded once on module init via `loadConfig()`. Throws immediately if any required env var is missing.

---

### 2.2 Database Schema

**File:** `services/indexer/src/config/database.ts`
**ORM:** Drizzle
**Migration:** `services/indexer/drizzle/0001_initial.sql` (auto-applied by Docker)

#### `indexed_events`

Canonical log of every ABI-matched contract event.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | Auto-increment |
| `contract_name` | `text` | e.g. `"stablecoin"`, `"navOracle"`, `"vault:0x..."` |
| `contract_address` | `text` | Checksummed hex address |
| `event_name` | `text` | e.g. `"Transfer"`, `"NAVUpdated"` |
| `block_number` | `bigint` | Chain block number |
| `tx_hash` | `text` | Transaction hash |
| `log_index` | `integer` | Log position within the transaction |
| `args` | `text` | JSON-encoded event args (bigints as strings) |
| `indexed_at` | `timestamp` | Wall-clock time the indexer wrote the row |

**Unique constraint:** `(tx_hash, log_index)` — prevents duplicate event writes on restart.

---

#### `nav_history`

Denormalized NAV oracle events for fast chart queries.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `vault_address` | `text` | The vault this NAV applies to |
| `total_assets` | `text` | Raw `totalAssets` value (6-decimal, as string) |
| `reported_timestamp` | `bigint` | UNIX seconds — from the contract event arg |
| `reporter` | `text` | Address of the NAV reporter |
| `block_number` | `bigint` | |
| `tx_hash` | `text` | |
| `indexed_at` | `timestamp` | |

**Unique constraint:** `(tx_hash)` — one NAV update per transaction.

---

#### `vault_transactions`

Deposits and withdrawals from ERC-4626 vaults.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `vault_address` | `text` | Which vault |
| `tx_type` | `text` | `"deposit"` or `"withdraw"` |
| `sender` | `text` | `msg.sender` (caller) |
| `owner` | `text` | Shares owner / asset recipient |
| `assets` | `text` | Asset amount (6-decimal string) |
| `shares` | `text` | Share amount (18-decimal string) |
| `block_number` | `bigint` | |
| `tx_hash` | `text` | |
| `block_timestamp` | `bigint` | UNIX seconds — fetched from the block |
| `indexed_at` | `timestamp` | |

**Unique constraint:** `(tx_hash, tx_type)`.

---

#### `stablecoin_transfers`

ERC-20 `Transfer` events from the NUSD stablecoin.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `from_address` | `text` | Sender (zero address = mint) |
| `to_address` | `text` | Recipient (zero address = burn) |
| `value` | `text` | Transfer amount (6-decimal string) |
| `block_number` | `bigint` | |
| `tx_hash` | `text` | |
| `block_timestamp` | `bigint` | |
| `indexed_at` | `timestamp` | |

**Unique constraint:** `(tx_hash, from_address, to_address)`.

> **Mints:** `from_address = '0x0000000000000000000000000000000000000000'`
> **Burns:** `to_address = '0x0000000000000000000000000000000000000000'`

---

#### `reserve_updates`

`ReserveUpdated` events from `ReserveTracker`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `asset_type` | `text` | e.g. `"T-Bills"`, `"Cash"` |
| `amount` | `text` | Reserve amount (USD, 6-decimal string) |
| `reporter` | `text` | Address that posted the update |
| `block_number` | `bigint` | |
| `tx_hash` | `text` | |
| `block_timestamp` | `bigint` | |
| `indexed_at` | `timestamp` | |

**Unique constraint:** `(tx_hash, asset_type)`.

---

#### `indexer_cursor`

Tracks the highest indexed block per event source. Used to resume after restart.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `source` | `text` UNIQUE | Contract source name (e.g. `"stablecoin"`, `"vault:0x..."`) |
| `last_block` | `bigint` | Highest block successfully indexed for this source |
| `updated_at` | `timestamp` | |

---

#### `known_vaults`

Registry of vault addresses to index. Populated from `VaultCreated` factory events, and seeded with `YIELD_VAULT_ADDRESS` on first boot.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `serial` PK | |
| `address` | `text` UNIQUE | Vault contract address |
| `registered_at` | `timestamp` | |

---

### 2.3 REST API

**Base URL:** `http://localhost:3001`

All responses are `application/json`. All `bigint`-typed DB columns are serialized as **strings** (see §6).

---

#### `GET /health`

Liveness probe.

```
Response 200:
{ "status": "ok" }
```

---

#### `GET /api/nav-history`

NAV oracle history for a vault.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `vault` | `string` | (all) | Filter by vault address |
| `limit` | `number` | `100` | Max rows, capped at 1000 |

**Response:** `NavHistoryEntry[]` sorted descending by `reportedTimestamp`.

```typescript
interface NavHistoryEntry {
  id: number;
  vaultAddress: string;
  totalAssets: string;        // bigint as string, 6-decimal NUSD units
  reportedTimestamp: string;  // UNIX seconds as string
  reporter: string;           // address
  blockNumber: string;        // bigint as string
  txHash: string;
  indexedAt: string;          // ISO 8601 datetime
}
```

**Example:**
```
GET /api/nav-history?vault=0x6671D7937ae8b9120A673724FD26CF06e61b4F67&limit=10
```

---

#### `GET /api/vault-transactions`

Deposits and withdrawals for a vault.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `vault` | `string` | (all) | Filter by vault address |
| `owner` | `string` | (all) | Filter by shares owner |
| `limit` | `number` | `50` | Max rows, capped at 500 |

**Response:** `VaultTransaction[]` sorted descending by `blockNumber`.

```typescript
interface VaultTransaction {
  id: number;
  vaultAddress: string;
  txType: "deposit" | "withdraw";
  sender: string;           // msg.sender
  owner: string;            // shares owner / asset recipient
  assets: string;           // 6-decimal NUSD units, as string
  shares: string;           // 18-decimal vault shares, as string
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;  // UNIX seconds as string; null if not yet fetched
  indexedAt: string;
}
```

---

#### `GET /api/transfers`

NUSD stablecoin transfer history.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `address` | `string` | (all) | Filter where `from` OR `to` matches |
| `limit` | `number` | `50` | Max rows, capped at 500 |

**Response:** `StablecoinTransfer[]` sorted descending by `blockNumber`.

```typescript
interface StablecoinTransfer {
  id: number;
  from: string;               // 'from_address' in DB (zero = mint)
  to: string;                 // 'to_address' in DB (zero = burn)
  value: string;              // 6-decimal NUSD units, as string
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}
```

---

#### `GET /api/reserve-history`

Reserve composition update history.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | `100` | Max rows, capped at 1000 |

**Response:** `ReserveUpdate[]` sorted descending by `blockNumber`.

```typescript
interface ReserveUpdate {
  id: number;
  assetType: string;          // e.g. "T-Bills", "Cash"
  amount: string;             // USD value, 6-decimal, as string
  reporter: string;
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}
```

---

#### `GET /api/events`

Raw indexed event log with filtering.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `contract` | `string` | (all) | Filter by `contractName` |
| `event` | `string` | (all) | Filter by `eventName` |
| `limit` | `number` | `50` | Max rows, capped at 500 |

**Response:** `IndexedEvent[]` sorted descending by `blockNumber`.

```typescript
interface IndexedEvent {
  id: number;
  contractName: string;
  contractAddress: string;
  eventName: string;
  blockNumber: string;
  txHash: string;
  logIndex: number;
  args: string;              // JSON string of event args (bigints as strings)
  indexedAt: string;
}
```

---

#### `GET /api/indexer-status`

Current indexing progress and registered vaults.

**Response:**
```typescript
interface IndexerStatus {
  cursors: {
    id: number;
    source: string;       // contract source name
    lastBlock: string;    // highest indexed block as string
    updatedAt: string;    // ISO 8601
  }[];
  vaults: {
    id: number;
    address: string;
    registeredAt: string; // ISO 8601
  }[];
}
```

---

### 2.4 Internal Types

**File:** `services/indexer/src/modules/events/events.service.ts`

```typescript
// Represents a single event source (contract) to poll
interface EventSource {
  name: string;           // unique key used in indexer_cursor.source
  address: `0x${string}`; // contract address
  abi: readonly any[];    // event ABI fragment array
}
```

The indexer maintains two source lists:
- `baseSources` — fixed at startup from `AppConfig.contracts`
- `vaultSources()` — dynamic, rebuilt from `known_vaults` table on each poll cycle

---

## 3. Frontend API Client — Types

**File:** `frontend/src/lib/api/indexer.ts`

These mirror the REST response types (§2.3) as TypeScript interfaces used in Svelte components.

```typescript
// All bigint-like fields come back as strings from the API
export interface NavHistoryEntry {
  id: number;
  vaultAddress: string;
  totalAssets: string;
  reportedTimestamp: string;  // UNIX seconds as string → use Number(x) * 1000 for Date
  reporter: string;
  blockNumber: string;
  txHash: string;
  indexedAt: string;
}

export interface VaultTransaction {
  id: number;
  vaultAddress: string;
  txType: "deposit" | "withdraw";
  sender: string;
  owner: string;
  assets: string;            // divide by 1e6 for NUSD display
  shares: string;            // divide by 1e18 for share display
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}

export interface StablecoinTransfer {
  id: number;
  from: string;
  to: string;
  value: string;             // divide by 1e6 for NUSD display
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}

export interface IndexerStatus {
  cursors: {
    source: string;
    lastBlock: string;
    updatedAt: string;
  }[];
  vaults: {
    address: string;
    registeredAt: string;
  }[];
}
```

**Utility functions exported from `indexer.ts`:**

```typescript
// Format a block timestamp (UNIX seconds string) as "YYYY-MM-DD HH:MM UTC"
export function fmtTimestamp(ts: string | null): string

// Format a 6-decimal bigint string as a USD display value
// e.g. "91000000000000" → "$91,000,000.0000"
export function fmtAssetStr(v: string): string
```

**Online status flag:**

```typescript
// Set true after a successful API response, false after any failure.
// Components read this to suppress polling when the indexer is known offline.
export let indexerOnline: boolean;
```

---

## 4. Smart Contract Interfaces

Key function signatures used by the frontend (via viem) and indexed by the indexer.

### NexusStableCoin (ERC-20, UUPS proxy)

```solidity
// Reads
function totalSupply() external view returns (uint256);
function balanceOf(address account) external view returns (uint256);
function allowance(address owner, address spender) external view returns (uint256);

// Writes
function approve(address spender, uint256 amount) external returns (bool);
function burn(uint256 amount) external;

// Events indexed
event Transfer(address indexed from, address indexed to, uint256 value);
```

Decimals: **6** (USDC convention). Display: divide by `1e6`.

---

### MintController

```solidity
// Reads
function allocationCeiling(address minter) external view returns (uint256);
function minted(address minter) external view returns (uint256);

// Writes
function mint(address to, uint256 amount) external;
function setAllocation(address minter, uint256 ceiling) external; // ADMIN
function resetMinted(address minter) external;                    // ADMIN
```

---

### NAVOracle

```solidity
// Reads
function latestNAV() external view returns (uint256 totalAssets, uint256 timestamp);
function reporter() external view returns (address);

// Writes
function postNAV(uint256 totalAssets) external; // REPORTER_ROLE

// Events indexed
event NAVUpdated(uint256 totalAssets, uint256 timestamp, address reporter);
```

`totalAssets` is denominated in **6-decimal NUSD units** (same as stablecoin).

---

### YieldVault (ERC-4626)

```solidity
// ERC-4626 standard reads
function totalAssets() external view returns (uint256);
function totalSupply() external view returns (uint256);
function convertToAssets(uint256 shares) external view returns (uint256);
function convertToShares(uint256 assets) external view returns (uint256);
function previewDeposit(uint256 assets) external view returns (uint256);
function previewWithdraw(uint256 assets) external view returns (uint256);
function balanceOf(address account) external view returns (uint256);
function name() external view returns (string);
function symbol() external view returns (string);

// Writes
function deposit(uint256 assets, address receiver) external returns (uint256 shares);
function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

// Events indexed
event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
```

Asset decimals: **6** (NUSD). Share decimals: **18**.

---

### YieldVaultFactory

```solidity
// Reads
function vaultCount() external view returns (uint256);
function allVaults(uint256 index) external view returns (address);

// Writes
function createVault(address asset, address oracle, string name, string symbol) external returns (address);

// Events indexed
event VaultCreated(address indexed vault, address indexed asset, address indexed oracle, string name, string symbol);
```

---

### ReserveTracker

```solidity
// Reads
function totalReserves() external view returns (uint256);
function getReserve(string assetType) external view returns (uint256 amount, uint256 lastUpdated);

// Writes
function postReserve(string assetType, uint256 amount) external; // REPORTER_ROLE

// Events indexed
event ReserveUpdated(string assetType, uint256 amount, address reporter);
```

---

### KYCRegistry

```solidity
// Reads
function kycStatus(address account) external view returns (bool approved, uint256 expiry);

// Writes (COMPLIANCE_ROLE)
function setKYC(address account, bool approved, uint256 expiry) external;
function revokeKYC(address account) external;
function batchSetKYC(address[] accounts, bool approved, uint256 expiry) external;

// Events indexed
event KYCUpdated(address indexed account, bool approved, uint256 expiry);
```

---

### RestrictionList (shared denylist)

```solidity
// Reads
function isRestricted(address account) external view returns (bool);

// Writes (RESTRICTOR_ROLE)
function restrict(address account) external;
function unrestrict(address account) external;
function batchRestrict(address[] accounts) external;

// Events indexed
event AddressRestricted(address indexed account);
event AddressUnrestricted(address indexed account);
```

---

## 5. Data Flow & Type Mapping

### NAV update lifecycle

```
Operator calls NAVOracle.postNAV(totalAssets)
  ↓ emits NAVUpdated(totalAssets, timestamp, reporter)
  ↓ indexer picks up via getLogs + parseEventLogs
  ↓ writes to nav_history table
    vaultAddress  = known_vaults[0].address (first known vault)
    totalAssets   = args.totalAssets.toString()   // stored as string
    reportedTimestamp = args.timestamp             // bigint → bigint column
  ↓ REST GET /api/nav-history returns NavHistoryEntry[]
    reportedTimestamp: "1775417652"               // serialized as string
  ↓ frontend fmtTimestamp("1775417652")
    → new Date(Number("1775417652") * 1000)
    → "2026-04-03 14:34 UTC"
```

### Vault deposit lifecycle

```
User calls YieldVault.deposit(assets, receiver)
  ↓ requires ERC-20 approve first
  ↓ emits Deposit(sender, owner, assets, shares)
  ↓ indexer picks up, fetches block for timestamp
  ↓ writes to vault_transactions
    txType  = "deposit"
    assets  = args.assets.toString()    // 6-decimal NUSD
    shares  = args.shares.toString()    // 18-decimal shares
  ↓ REST GET /api/vault-transactions returns VaultTransaction[]
  ↓ frontend: Number(tx.assets) / 1e6 → display USD value
```

---

## 6. BigInt Handling Conventions

The protocol uses `bigint` throughout for on-chain values. Here is how each layer handles it:

| Layer | Representation | Notes |
|-------|---------------|-------|
| Solidity | `uint256` | Native |
| viem (JS) | `bigint` | All on-chain return values |
| Drizzle schema | `bigint` column with `{ mode: "bigint" }` | Returns JS `bigint` |
| Indexer DB write | `bigint` directly | Drizzle handles postgres `int8` |
| Indexer API response | **string** | `BigInt.prototype.toJSON` patch in `main.ts` |
| Frontend REST client | `string` fields | Declared as `string` in TypeScript interfaces |
| Frontend display | `Number(x) / 1e6` | Only safe because values fit in JS Number |
| Frontend contract read | `bigint` | viem returns `bigint`; Svelte uses `BigInt()` arithmetic |

**Rule:** Never store raw `bigint` in a Svelte `$state` variable that renders to the DOM directly — always convert to string or number first.

**Rule:** Asset amounts stored in the DB are always strings (not bigint columns) to avoid any precision edge cases in the ORM layer. Only block numbers and timestamps use bigint columns.

---

## 7. Address Conventions

- All addresses in the codebase are lowercase hex strings: `0x82671ab3...`
- viem uses `0x${string}` template literal type
- Database stores as `text` (no checksum enforcement at the DB level)
- Frontend contract calls cast with `as \`0x${string}\``
- Full deployed addresses: see `docs/TESTNET_DEPLOYMENT.md`
- Frontend address constants: `frontend/src/lib/contracts/addresses.ts`
- Indexer address config: `services/indexer/.env` and `docker-compose.yml` env block

---

*For the API gateway implementation plan and future service interfaces, see `docs/DEVELOPER_DOCS_ROADMAP.md`.*
