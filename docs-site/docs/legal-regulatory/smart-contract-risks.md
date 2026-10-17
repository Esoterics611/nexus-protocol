# Smart Contract Risks

Technical risk profile of the Nexus Protocol smart contracts: upgrade mechanism, admin key management, oracle trust model, security protections, and known limitations.

---

## Upgrade Mechanism (UUPS)

### What is upgradeable

Only **NexusStableCoin** uses the UUPS proxy pattern. All other contracts are non-upgradeable.

### How UUPS works

The UUPS pattern places upgrade logic in the implementation contract, not the proxy:

1. A new implementation contract is deployed
2. The `DEFAULT_ADMIN_ROLE` holder calls `upgradeToAndCall(newImplementation, data)` on the proxy
3. The current implementation's `_authorizeUpgrade()` verifies the caller has admin authority
4. The proxy updates its implementation pointer to the new contract
5. All subsequent calls route to the new implementation

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Admin key compromise | High | Use multisig (3-of-5 recommended) for DEFAULT_ADMIN_ROLE |
| Malicious upgrade | High | Timelock governance (Planned) adds mandatory delay before execution |
| Storage collision | Medium | OpenZeppelin's storage layout tools prevent collisions |
| No downgrade path | Medium | Thorough testing on testnet before mainnet upgrades |
| Implementation without upgrade function | Critical | OpenZeppelin's UUPSUpgradeable base prevents this |

### Non-upgradeable contracts

All other contracts (vaults, compliance, accounting, derivatives) are non-upgradeable. They can be **replaced** by:

1. Deploying a new version of the contract
2. Updating references in dependent contracts
3. Migrating state if necessary

This means the original contract remains permanently on-chain — its state is never modified.

---

## Admin Key Management

### Current state (Testnet)

!!! warning "Testnet Only"
    All roles are currently held by a single deployer address (`0x41521c37...`). This is acceptable for testing but must be changed before any mainnet deployment.

### Production recommendations

| Role Category | Recommended Setup | Threshold |
|--------------|-------------------|-----------|
| DEFAULT_ADMIN (all contracts) | Gnosis Safe multisig | 3-of-5 |
| PAUSER_ROLE | Separate emergency multisig | 2-of-3 |
| REPORTER_ROLE (oracle) | Automated bot with restricted key | Single key (bot) |
| VERIFIER_ROLE (KYC) | KYC provider service address | Single key (service) |
| RESTRICTOR_ROLE | Compliance service address | Single key (service) |
| MINTER_ROLE | MintController contract only | N/A (contract) |

### Key management risks

| Risk | Mitigation |
|------|------------|
| Single point of failure | Multisig wallets distribute control across multiple parties |
| Key loss | Multisig ensures no single lost key blocks operations |
| Insider compromise | Require multiple signers for critical operations |
| Service key compromise | Limit service keys to minimal required roles; rotate regularly |

---

## Oracle Trust Model

### How the oracle works

The NAVOracle is a trusted-reporter model: only addresses with `REPORTER_ROLE` can post NAV values. The oracle does NOT fetch prices from external sources — it receives them from authorized reporters.

### Trust assumptions

| Assumption | Implication |
|-----------|-------------|
| Reporter posts accurate NAV | If the reporter is compromised, share prices can be manipulated |
| Reporter posts timely updates | Stale NAV means share prices don't reflect current asset values |
| Reporter acts in good faith | No on-chain validation of NAV correctness against external data |

### Validation rules (on-chain)

The oracle enforces minimal validation:

- `totalAssets` must be greater than zero
- `timestamp` must be greater than or equal to the last posted timestamp
- Only `REPORTER_ROLE` holders can post

### Risks and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Compromised reporter posts false NAV | High | Use multisig for reporter; reconciliation service (Planned) compares oracle vs external data |
| Stale NAV (no updates) | Medium | Monitoring alerts on missed updates; vault falls back to token balance if no oracle entries |
| Flash manipulation | Low | Reporter is not permissionless — only authorized addresses can post |

---

## Security Protections

### Built-in protections

| Protection | Implementation |
|-----------|---------------|
| **Reentrancy guard** | `ReentrancyGuard` on CreditVault, YieldSplitter, ETFWrapper |
| **Access control** | OpenZeppelin `AccessControl` on every contract |
| **Safe transfers** | `SafeERC20` for all token interactions in derivatives |
| **Integer overflow** | Solidity 0.8.28 built-in overflow checks |
| **Initialization protection** | `_disableInitializers()` on NexusStableCoin implementation |
| **Pause mechanism** | `PausableUpgradeable` on NexusStableCoin |

### Audit status

| Item | Status |
|------|--------|
| OpenZeppelin base contracts (v5.6.1) | Audited by OpenZeppelin |
| Nexus Protocol custom contracts | Not yet independently audited |
| Formal verification | Not performed |

!!! warning "Audit Pending"
    Custom contract logic has not been independently audited. An independent security audit is recommended before any mainnet deployment with real funds.

---

## Known Limitations

| Limitation | Description | Impact |
|-----------|-------------|--------|
| **Single-chain deployment** | Contracts are deployed per-chain with no native cross-chain messaging | Users on different chains cannot interact directly |
| **Oracle centralization** | NAV reporting depends on a single authorized reporter | Single point of trust for share pricing |
| **No on-chain liquidation bot** | CreditVault liquidation requires external callers | Positions may remain undercollateralized if no one liquidates |
| **No withdrawal queue** | Vault withdrawals are immediate | Large withdrawals may be blocked if vault holds insufficient liquid assets |
| **MintController ceiling** | Per-minter allocation must be set before minting | Administrative overhead; failure to set allocation blocks minting |
| **KYC expiry not enforced on existing positions** | Expired KYC blocks new deposits but does not force redemption | Users with expired KYC retain existing positions until they voluntarily withdraw |
| **ETFWrapper single-asset constraint** | All underlying vaults must share the same base asset (NUSD) | Cannot mix vaults with different deposit tokens |

---

## Dependency Risk

| Dependency | Version | Risk |
|-----------|---------|------|
| OpenZeppelin Contracts | v5.6.1 | Low — widely audited, industry standard |
| OpenZeppelin Contracts-Upgradeable | v5.6.1 | Low — same as above |
| Solidity compiler | 0.8.28 | Low — mature compiler version |
| Hardhat | v3 | Low — development tool only, not deployed |
| Base (L2 chain) | Cancun EVM | Medium — L2 sequencer dependency; bridge risk for cross-chain |
