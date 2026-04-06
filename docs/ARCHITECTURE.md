# Nexus Protocol — Architecture

## System Overview

Nexus Protocol is an institutional digital asset protocol suite consisting of three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                             │
│  SvelteKit Investor Portal  │  Operator Dashboard  │  DAO UI   │
└─────────────────────┬───────────────────┬───────────────────────┘
                      │                   │
┌─────────────────────┴───────────────────┴───────────────────────┐
│                    SERVICES LAYER                                │
│  API Gateway  │  Event Indexer  │  Oracle Reporter  │  Compliance│
│  Reconciliation  │  Reserve Monitor  │  Audit Reporter          │
└─────────────────────┬───────────────────┬───────────────────────┘
                      │                   │
┌─────────────────────┴───────────────────┴───────────────────────┐
│                   SMART CONTRACT LAYER                           │
│  Vaults (ERC-4626)  │  Stablecoin (UUPS)  │  Derivatives       │
│  Compliance  │  Accounting  │  Governance                       │
└─────────────────────────────────────────────────────────────────┘
                      │
              ┌───────┴────────┐
              │   BLOCKCHAIN   │
              │  Base / Ethereum│
              └────────────────┘
```

## Smart Contract Architecture

### Contract Dependency Graph

```
YieldVaultFactory
    └── creates → YieldVault
                      ├── reads → NAVOracle (totalAssets)
                      ├── calls → ITransferRestrictions.isTransferAllowed()
                      └── holds → ERC-20 deposit token (e.g. NexusStableCoin)

NexusStableCoin (UUPS Proxy)
    ├── checks → RestrictionList.isRestricted()
    └── minted via → MintController
                        └── calls → NexusStableCoin.mint()

TransferRestrictions (implements ITransferRestrictions)
    ├── reads → RestrictionList.isRestricted()
    └── reads → KYCRegistry.isVerified()

NexusGovernor (TODO)
    └── executes via → NexusTimelock (TODO)
                          └── controls → vault params, compliance settings

ReserveTracker ── standalone reserve accounting
AuditLog ── standalone event log
AccreditedInvestor ── standalone accreditation registry
YieldDistributor (TODO) ── standalone streaming yield
```

### Vault Flow (Deposit → Yield → Withdraw)

```
1. User deposits USDC into YieldVault
   └── YieldVault.deposit(assets, receiver)
       ├── TransferRestrictions.isTransferAllowed(0x0, receiver, shares)
       ├── Transfer USDC from user → vault
       └── Mint vault shares to receiver

2. Oracle reports NAV increase (yield accrual)
   └── NAVOracle.postNAV(newTotalAssets, timestamp)
       └── Share price = totalAssets / totalSupply (increases)

3. User withdraws with profit
   └── YieldVault.withdraw(assets, receiver, owner)
       ├── TransferRestrictions.isTransferAllowed(owner, 0x0, shares)
       ├── Burn vault shares
       └── Transfer USDC from vault → receiver
```

### Stablecoin Flow (Mint → Transfer → Burn)

```
1. Minter mints through MintController
   └── MintController.mint(to, amount)
       ├── Check: amount <= remainingAllocation(msg.sender)
       ├── Deduct from allocation
       └── NexusStableCoin.mint(to, amount)
           └── RestrictionList.isRestricted(to) → must be false

2. Transfer between users
   └── NexusStableCoin.transfer(to, amount)
       ├── RestrictionList.isRestricted(from) → must be false
       └── RestrictionList.isRestricted(to) → must be false

3. Burner burns
   └── NexusStableCoin.burn(from, amount)
```

### Compliance Architecture

```
                    TransferRestrictions
                    (plugged into YieldVault)
                   /                        \
          RestrictionList              KYCRegistry
          (shared denylist)            (KYC + expiry)
          Used by:                     Used by:
          - YieldVault (via TR)        - TransferRestrictions
          - NexusStableCoin (direct)
                                       AccreditedInvestor
                                       (standalone, for restricted products)
```

## Role Architecture

Each contract uses OpenZeppelin AccessControl. Role hierarchy:

| Contract | Roles | Purpose |
|----------|-------|---------|
| **YieldVault** | DEFAULT_ADMIN, ADMIN_ROLE, ORACLE_ROLE | Admin configures oracle + restrictions |
| **NAVOracle** | DEFAULT_ADMIN, REPORTER_ROLE | Reporter posts NAV, admin manages reporters |
| **YieldVaultFactory** | DEFAULT_ADMIN | Only admin can create new vaults |
| **NexusStableCoin** | DEFAULT_ADMIN, MINTER, BURNER, PAUSER, RESTRICTOR | Full role separation for stablecoin ops |
| **MintController** | DEFAULT_ADMIN, ADMIN_ROLE, ALLOCATOR_ROLE | Allocator sets ceilings, admin resets amounts |
| **RestrictionList** | DEFAULT_ADMIN, RESTRICTOR_ROLE | Restrictor manages denylist |
| **TransferRestrictions** | DEFAULT_ADMIN | Admin configures sub-modules |
| **KYCRegistry** | DEFAULT_ADMIN, VERIFIER_ROLE | Verifier sets/revokes KYC |
| **AccreditedInvestor** | DEFAULT_ADMIN, VERIFIER_ROLE | Verifier manages accreditation |
| **ReserveTracker** | DEFAULT_ADMIN, REPORTER_ROLE | Reporter posts reserve data |
| **AuditLog** | DEFAULT_ADMIN, LOGGER_ROLE | Logger writes audit entries |

## Upgradeability Strategy

- **NexusStableCoin**: UUPS proxy (upgradeable). Only DEFAULT_ADMIN can authorize upgrades.
- **All other contracts**: Non-upgradeable. Replaced by deploying new versions and updating references.
- **Why**: Stablecoin must be upgradeable (regulatory changes, bug fixes for money). Vaults and compliance contracts can be replaced via factory/config updates.

## Multi-Chain Strategy

```
BASE SEPOLIA (development)
    └── All contracts deployed here first for testing

BASE MAINNET (primary deployment)
    └── Vaults, stablecoin, compliance, governance
    └── Low gas, fast finality, institutional (Coinbase)

ETHEREUM MAINNET (canonical stablecoin)
    └── NexusStableCoin canonical deployment
    └── Maximum institutional credibility

ARBITRUM (DeFi composability)
    └── Vault deposits bridged from Base
    └── Integration with Arbitrum DeFi ecosystem
```

## Off-Chain Services (Phase 3 — Not Yet Built)

```
services/
├── api-gateway/         NestJS REST + WebSocket + GraphQL
├── event-indexer/       The Graph subgraph or Ponder
├── reconciliation/      Compare on-chain vs oracle state
├── oracle-reporter/     Fetch prices → post NAV on-chain
├── compliance/          Sanctions screening, denylist sync
├── reserve-monitor/     Track reserve ratio, alert on discrepancy
├── audit-reporter/      Generate attestation reports
└── shared/              Types, utils, config
```

## Technology Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| Smart Contracts | Solidity 0.8.28 / Hardhat v3 / OZ v5 | ✅ Built |
| Chain | Base (Cancun EVM) | ✅ Configured |
| Backend | NestJS (TypeScript) | Phase 3 |
| Frontend | SvelteKit | Phase 4 |
| Indexing | The Graph or Ponder | Phase 3 |
| Database | PostgreSQL | Phase 3 |
| Cache | Redis | Phase 3 |
| Monitoring | Prometheus + Grafana | Phase 5 |
