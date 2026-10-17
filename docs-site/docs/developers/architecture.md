# Architecture

System layers, contract relationships, and data flow diagrams.

---

## System Layers

```mermaid
graph TB
    subgraph Frontend["Frontend Layer (Planned)"]
        SvelteKit["SvelteKit Investor Portal"]
        OpDash["Operator Dashboard"]
        DAO["DAO UI (Planned)"]
    end

    subgraph Services["Services Layer (Partial)"]
        Gateway["API Gateway (Planned)"]
        Indexer["Event Indexer"]
        OracleReporter["Oracle Reporter (Planned)"]
        ComplianceSvc["Compliance Service (Planned)"]
        Reconciler["Reconciliation (Planned)"]
        ReserveMonitor["Reserve Monitor (Planned)"]
    end

    subgraph Contracts["Smart Contract Layer"]
        Vaults["Vaults<br/>(ERC-4626)"]
        Stablecoin["Stablecoin<br/>(UUPS)"]
        Derivatives["Derivatives"]
        Compliance["Compliance"]
        Accounting["Accounting"]
    end

    subgraph Chain["Blockchain"]
        Base["Base / Ethereum"]
    end

    Frontend --> Services
    Services --> Contracts
    Contracts --> Chain
```

---

## Contract Dependency Graph

```mermaid
graph TB
    Factory["YieldVaultFactory"] -->|creates| Vault["YieldVault"]
    Vault -->|reads| Oracle["NAVOracle"]
    Vault -->|calls| TR["TransferRestrictions"]
    Vault -->|holds| NUSD["NexusStableCoin"]

    NUSD -->|checks| RL["RestrictionList"]
    MC["MintController"] -->|calls mint| NUSD

    TR -->|reads| RL
    TR -->|reads| KYC["KYCRegistry"]

    AI["AccreditedInvestor"]
    RT["ReserveTracker"]
    AL["AuditLog"]

    subgraph Derivatives
        YS["YieldSplitter"] -->|holds shares of| Vault
        YS -->|mints| PT["PrincipalToken"]
        YS -->|mints| YT["YieldToken"]
        CV["CreditVault"] -->|collateral from| Vault
        CV -->|borrows| NUSD
        ETF["ETFWrapper"] -->|deposits into| Vault
    end
```

---

## Vault Flow (Deposit to Yield to Withdraw)

```mermaid
sequenceDiagram
    participant User
    participant Vault as YieldVault
    participant TR as TransferRestrictions
    participant Oracle as NAVOracle
    participant NUSD as NexusStableCoin

    Note over User,NUSD: Step 1: Deposit
    User->>NUSD: approve(vault, amount)
    User->>Vault: deposit(assets, receiver)
    Vault->>TR: isTransferAllowed(0x0, receiver, shares)
    TR-->>Vault: true
    Vault->>NUSD: transferFrom(user, vault, assets)
    Vault->>User: mint shares

    Note over User,NUSD: Step 2: Yield Accrual (daily)
    Oracle->>Oracle: postNAV(newTotalAssets, timestamp)
    Note over Vault: sharePrice = totalAssets / totalSupply

    Note over User,NUSD: Step 3: Withdraw
    User->>Vault: withdraw(assets, receiver, owner)
    Vault->>TR: isTransferAllowed(owner, 0x0, shares)
    TR-->>Vault: true
    Vault->>Vault: burn shares
    Vault->>NUSD: transfer(receiver, assets + yield)
```

---

## Stablecoin Flow (Mint to Transfer to Burn)

```mermaid
sequenceDiagram
    participant Admin
    participant Minter
    participant MC as MintController
    participant NUSD as NexusStableCoin
    participant RL as RestrictionList

    Note over Admin,RL: Step 1: Set Allocation (required first)
    Admin->>MC: setMintAllocation(minter, ceiling)

    Note over Admin,RL: Step 2: Mint
    Minter->>MC: mint(customer, amount)
    MC->>MC: Check allocation ceiling
    MC->>NUSD: mint(customer, amount)
    NUSD->>RL: isRestricted(customer)
    RL-->>NUSD: false
    NUSD->>NUSD: Mint tokens to customer

    Note over Admin,RL: Step 3: Transfer
    NUSD->>RL: isRestricted(from)
    NUSD->>RL: isRestricted(to)

    Note over Admin,RL: Step 4: Burn
    NUSD->>NUSD: burn(from, amount)
```

---

## Compliance Architecture

```mermaid
graph TB
    subgraph Compliance["Compliance Module"]
        TR["TransferRestrictions"]
        RL["RestrictionList<br/>(Shared Denylist)"]
        KYC["KYCRegistry<br/>(KYC + Expiry)"]
        AI["AccreditedInvestor"]
    end

    TR --> RL
    TR --> KYC

    NUSD["NexusStableCoin"] -->|"direct check"| RL
    Vault["YieldVault"] -->|"via TR"| TR
```

- **RestrictionList** is shared across all tokens. One `restrict()` call blocks an address everywhere.
- **TransferRestrictions** composes denylist + KYC checks. Plugged into vaults.
- **NexusStableCoin** checks the denylist directly (does not use TransferRestrictions).
- **AccreditedInvestor** is standalone, available for future product gating.

---

## Derivatives Architecture

```mermaid
graph LR
    subgraph YieldStripping["Yield Stripping"]
        Shares1["Vault Shares"] --> YS["YieldSplitter"]
        YS --> PT["Principal Token<br/>Fixed rate at maturity"]
        YS --> YT_["Yield Token<br/>Floating yield"]
    end

    subgraph Lending["Collateralized Lending"]
        Shares2["Vault Shares"] --> CV["CreditVault"]
        CV --> Borrowed["NUSD Borrowed"]
    end

    subgraph Basket["Basket Product"]
        NUSD_["NUSD"] --> ETF["ETFWrapper"]
        ETF --> V1["Vault 1"]
        ETF --> V2["Vault 2"]
        ETF --> Vn["Vault N"]
    end
```

All derivatives consume ERC-4626 vault shares as their underlying collateral. They never hold raw NUSD or external tokens directly.

---

## Multi-Chain Strategy

| Chain | Purpose | Status |
|-------|---------|--------|
| **Base Sepolia** | Development and testing | All contracts deployed |
| **Base Mainnet** | Primary deployment — low gas, fast finality | Planned |
| **Ethereum Mainnet** | Canonical stablecoin — institutional credibility | Planned |
| **Arbitrum** | DeFi composability — bridge vault deposits | Planned |

---

## Off-Chain Services

| Service | Purpose | Status |
|---------|---------|--------|
| API Gateway | REST + WebSocket + GraphQL | Planned (NestJS) |
| Event Indexer | Index on-chain events for queries | Running |
| Oracle Reporter | Fetch prices, post NAV on-chain | Planned |
| Compliance Service | Sanctions screening, denylist sync | Planned |
| Reserve Monitor | Track reserve ratio, alert on discrepancy | Planned |
| Audit Reporter | Generate attestation reports | Planned |
| Reconciliation | Compare on-chain vs oracle state | Planned |
