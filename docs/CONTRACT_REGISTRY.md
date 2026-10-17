# Nexus Protocol — Contract Registry

## Deployed Contracts

> Base Sepolia deployment — 2026-04-05. See `docs/TESTNET_DEPLOYMENT.md` for full details.

### Base Sepolia (Chain ID 84532)

| Contract | Address |
|---|---|
| NexusStableCoin (proxy) | `0x82671ab3119c8f73acc0ee43c6b167b46b948141` |
| NexusStableCoin (impl) | `0x417b8aa2092298ebc23086571a14c4802984ee9b` |
| MintController | `0xee9b15f35ea7a9920c38ac1aacd5af265931886a` |
| NAVOracle | `0x28dc5ccc6a97675b7def7b4c4179b85127b698f3` |
| YieldVaultFactory | `0x7802ee123ef4a834987f69ed020da67881ce86b0` |
| YieldVault (nxTREASURY) | `0x6671D7937ae8b9120A673724FD26CF06e61b4F67` |
| ReserveTracker | `0x9e9abd3734140eb7de220e190cc63436405ab219` |
| AuditLog | `0xbf2f6169366b4971b6a1918af34b13f04ad1cc2c` |
| RestrictionList | `0xea1ea3239ac1731acb6cffbe666fa6ff55e5a669` |
| KYCRegistry | `0xadac3b940503626d5c72e202bf165c572d3ea11a` |
| AccreditedInvestor | `0xd30fc13df30b31bc6d4c5fe7e3ee3877093fcf31` |
| TransferRestrictions | `0xbaa4050fef138f3f9dc19373db6b57860059c5a9` |

| MockPriceFeed | `0xf6752cf9665db80a396073c66ac8df4b4b5327be` |
| ETHSwapGateway | `0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b` |

**Deployer / admin:** `0x41521c37dB02956185437C4e2461261A321073E1`
All roles currently held by deployer. See role summary in `TESTNET_DEPLOYMENT.md`.

> Gateway deployed 2026-04-06. MINTER_ROLE + BURNER_ROLE granted on NUSD. 0.05 ETH seeded for redemptions. Price: $2800 (MockPriceFeed, admin-settable).

---

## Contract Inventory

### Vault Module (`contracts/vaults/`)

| Contract | File | Upgradeable | Key Roles | Dependencies |
|----------|------|-------------|-----------|-------------|
| **YieldVault** | `YieldVault.sol` | No | ADMIN_ROLE, ORACLE_ROLE | NAVOracle, ITransferRestrictions, ERC-20 deposit token |
| **NAVOracle** | `NAVOracle.sol` | No | REPORTER_ROLE | None |
| **YieldVaultFactory** | `YieldVaultFactory.sol` | No | DEFAULT_ADMIN | YieldVault (creates instances) |
| **ITransferRestrictions** | `ITransferRestrictions.sol` | — (interface) | — | — |

### Stablecoin Module (`contracts/stablecoin/`)

| Contract | File | Upgradeable | Key Roles | Dependencies |
|----------|------|-------------|-----------|-------------|
| **NexusStableCoin** | `NexusStableCoin.sol` | **Yes (UUPS)** | MINTER, BURNER, PAUSER, RESTRICTOR, ADMIN | RestrictionList |
| **MintController** | `MintController.sol` | No | ADMIN_ROLE, ALLOCATOR_ROLE | NexusStableCoin (must have MINTER_ROLE) — **all mints go through this; requires `setMintAllocation()` per minter before any mint** |
| **RestrictionList** | `RestrictionList.sol` | No | RESTRICTOR_ROLE | None |

### Compliance Module (`contracts/compliance/`)

| Contract | File | Upgradeable | Key Roles | Dependencies |
|----------|------|-------------|-----------|-------------|
| **TransferRestrictions** | `TransferRestrictions.sol` | No | DEFAULT_ADMIN | RestrictionList, KYCRegistry |
| **KYCRegistry** | `KYCRegistry.sol` | No | VERIFIER_ROLE | None |
| **AccreditedInvestor** | `AccreditedInvestor.sol` | No | VERIFIER_ROLE | None |

### Accounting Module (`contracts/accounting/`)

| Contract | File | Upgradeable | Key Roles | Dependencies |
|----------|------|-------------|-----------|-------------|
| **ReserveTracker** | `ReserveTracker.sol` | No | REPORTER_ROLE | None |
| **AuditLog** | `AuditLog.sol` | No | LOGGER_ROLE | None |

### Governance Module (`contracts/governance/`) — TODO

| Contract | File | Upgradeable | Key Roles | Dependencies |
|----------|------|-------------|-----------|-------------|
| **NexusGovernor** | `NexusGovernor.sol` | — | — | NexusTimelock, governance token |
| **NexusTimelock** | `NexusTimelock.sol` | — | PROPOSER, EXECUTOR, CANCELLER | — |

### Derivatives Module (`contracts/derivatives/`) — Phase 2

| Contract | File | Status |
|----------|------|--------|
| YieldSplitter | `YieldSplitter.sol` | Not started |
| PrincipalToken | `PrincipalToken.sol` | Not started |
| YieldToken | `YieldToken.sol` | Not started |
| StructuredProduct | `StructuredProduct.sol` | Not started |
| CreditVault | `CreditVault.sol` | Not started |
| ETFWrapper | `ETFWrapper.sol` | Not started |

---

## Deployment Records

### Base Sepolia
See address table at top of this file and full details in `docs/TESTNET_DEPLOYMENT.md`.

### Base Mainnet
| Contract | Address | Tx Hash | Block | Date |
|----------|---------|---------|-------|------|
| — | — | — | — | — |

### Ethereum Mainnet
| Contract | Address | Tx Hash | Block | Date |
|----------|---------|---------|-------|------|
| — | — | — | — | — |

---

## Wiring Requirements

When deploying, contracts must be wired together in this order:

1. Deploy **RestrictionList** (standalone)
2. Deploy **KYCRegistry** (standalone)
3. Deploy **AccreditedInvestor** (standalone)
4. Deploy **TransferRestrictions** (references RestrictionList + KYCRegistry)
5. Deploy **NAVOracle** (standalone)
6. Deploy **NexusStableCoin** implementation, then deploy UUPS proxy
7. Initialize NexusStableCoin via proxy
8. Set RestrictionList on NexusStableCoin
9. Deploy **MintController** (references NexusStableCoin proxy)
10. Grant MINTER_ROLE on NexusStableCoin to MintController
11. Deploy **YieldVault** (references deposit token + NAVOracle)
12. Set TransferRestrictions on YieldVault
13. Deploy **YieldVaultFactory** (optional — can also deploy vaults manually)
14. Deploy **ReserveTracker** (standalone)
15. Deploy **AuditLog** (standalone)
16. Grant REPORTER_ROLE on NAVOracle to oracle reporter address
17. Grant REPORTER_ROLE on ReserveTracker to reserve reporter address
18. Grant LOGGER_ROLE on AuditLog to all contracts that should log
