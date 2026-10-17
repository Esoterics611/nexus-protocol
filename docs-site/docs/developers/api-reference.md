# API Reference

REST API endpoints provided by the event indexer service, and planned WebSocket events.

---

## Event Indexer REST API

### Base URL

| Environment | URL |
|-------------|-----|
| Local | `http://localhost:3001/api` |
| Production | `https://indexer.nexusprotocol.io/api` (Planned) |

---

### Events

#### `GET /api/events`

Query indexed on-chain events with optional filters.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `contract` | `address` | Filter by contract address |
| `event` | `string` | Filter by event name (e.g., "Transfer", "NAVUpdated") |
| `from` | `number` | Start block number |
| `to` | `number` | End block number |
| `limit` | `number` | Max results (default: 100) |
| `offset` | `number` | Pagination offset |

---

### Stablecoin

#### `GET /api/stablecoin/stats`

Returns current NUSD statistics.

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `totalSupply` | `string` | Current NUSD total supply (6 decimals) |
| `holderCount` | `number` | Number of unique holders |
| `transferCount` | `number` | Total transfer count |
| `isPaused` | `boolean` | Whether the stablecoin is paused |

---

### Vaults

#### `GET /api/vaults`

Returns all registered vaults with key metrics.

**Response fields (per vault):**

| Field | Type | Description |
|-------|------|-------------|
| `address` | `address` | Vault contract address |
| `name` | `string` | Vault name (e.g., "Nexus Treasury Vault") |
| `symbol` | `string` | Share token symbol (e.g., "nxTREASURY") |
| `totalAssets` | `string` | Total assets in NUSD (6 decimals) |
| `totalSupply` | `string` | Total shares in circulation |
| `sharePrice` | `string` | Current share price (6 decimals) |
| `apy` | `number` | Estimated APY based on NAV history |

#### `GET /api/vault/:address`

Returns detailed information for a specific vault.

**Additional fields:**

| Field | Type | Description |
|-------|------|-------------|
| `oracleAddress` | `address` | NAV oracle contract address |
| `depositToken` | `address` | Underlying asset address |
| `restrictionsAddress` | `address` | Transfer restrictions module |
| `navHistory` | `array` | Recent NAV updates with timestamps |

---

### Derivatives (Planned)

#### `GET /api/split-positions`

Query PT/YT positions from the YieldSplitter.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `address` | Filter by user address |

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `user` | `address` | Position holder |
| `ptBalance` | `string` | Principal Token balance |
| `ytBalance` | `string` | Yield Token balance |
| `maturity` | `number` | UNIX timestamp |
| `vaultAddress` | `address` | Underlying vault |

#### `GET /api/credit-positions`

Query CreditVault positions.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `address` | Filter by user address |

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `user` | `address` | Borrower address |
| `collateralShares` | `string` | Vault shares locked |
| `collateralValue` | `string` | Current NUSD value of collateral |
| `debtNUSD` | `string` | Outstanding debt (with accrued interest) |
| `ltv` | `number` | Current LTV in basis points |

#### `GET /api/at-risk-positions`

Returns CreditVault positions approaching or exceeding the liquidation threshold.

**Response:** Array of credit positions where LTV > 11000 (110%).

---

## WebSocket Events (Planned)

Real-time event streaming via WebSocket connection.

| Channel | Events | Description |
|---------|--------|-------------|
| `vault:{address}` | `deposit`, `withdraw`, `navUpdate` | Vault activity |
| `stablecoin` | `transfer`, `mint`, `burn`, `pause` | NUSD activity |
| `compliance` | `restricted`, `unrestricted`, `kycVerified`, `kycRevoked` | Compliance changes |
| `derivatives` | `split`, `unsplit`, `liquidated` | Derivative events |

!!! note "Status: Planned"
    WebSocket support is part of the Phase 3 API Gateway (NestJS). The current indexer provides REST-only access.

---

## Error Responses

All endpoints return standard error format:

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `400` | Invalid parameters |
| `404` | Resource not found |
| `500` | Internal server error |

Error body:

```json
{
  "error": "Description of the error",
  "code": "ERROR_CODE"
}
```
