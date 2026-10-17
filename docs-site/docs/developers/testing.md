# Testing

Test suite overview, how to run, coverage expectations, and test patterns.

---

## Running Tests

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/YieldVault.test.ts

# Run with gas reporting
REPORT_GAS=true npx hardhat test

# Run coverage
npx hardhat coverage
```

---

## Test Structure

Tests are organized by module, matching the contract directory layout:

```
test/
├── YieldVault.test.ts
├── NAVOracle.test.ts
├── NexusStableCoin.test.ts
├── MintController.test.ts
├── RestrictionList.test.ts
├── TransferRestrictions.test.ts
├── KYCRegistry.test.ts
├── AccreditedInvestor.test.ts
├── ReserveTracker.test.ts
├── AuditLog.test.ts
├── ETHSwapGateway.test.ts
└── derivatives/
    ├── YieldSplitter.test.ts
    ├── CreditVault.test.ts
    └── ETFWrapper.test.ts
```

---

## Test Patterns

### Framework

All tests use:

- **Hardhat v3** with ESM modules
- **Viem** for contract interactions (NOT ethers.js)
- **Hardhat's test fixtures** (`loadFixture`) for efficient test setup

### Common test fixture pattern

```typescript
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

async function deployFixture() {
  const [admin, user1, user2] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();

  // Deploy contracts...

  return { contract, admin, user1, user2, publicClient };
}

describe("ContractName", function () {
  it("should do something", async function () {
    const { contract, user1 } = await loadFixture(deployFixture);
    // Test logic...
  });
});
```

### Key test scenarios per contract

| Contract | Critical test scenarios |
|----------|----------------------|
| **YieldVault** | Deposit, withdraw, share pricing with oracle, transfer restrictions |
| **NexusStableCoin** | Mint, burn, pause/unpause, restriction enforcement, upgrade |
| **MintController** | Allocation ceiling enforcement, over-mint revert, reset |
| **TransferRestrictions** | Denylist block, KYC block, KYC toggle |
| **KYCRegistry** | Set/revoke/batch, expiry enforcement |
| **YieldSplitter** | Split, unsplit, yield distribution, PT/YT redeem at maturity |
| **CreditVault** | Deposit, borrow, repay, withdraw, liquidation, interest accrual |
| **ETFWrapper** | Deposit, withdraw, NAV calculation, weight allocation |

### Time manipulation for tests

For testing maturity, interest accrual, and KYC expiry:

```typescript
import { time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

// Advance time by 365 days
await time.increase(365 * 24 * 60 * 60);

// Set to specific timestamp
await time.increaseTo(maturityTimestamp);
```

---

## Coverage Targets

| Module | Target Coverage |
|--------|:-:|
| Vaults | > 90% |
| Stablecoin | > 95% |
| Compliance | > 90% |
| Accounting | > 85% |
| Derivatives | > 90% |

---

## Post-Deployment Testing (Testnet Checklist)

After deploying to Base Sepolia, verify each workflow in order:

1. Set MintController allocation (required before any mint)
2. Mint NUSD — verify balance and stats update
3. Restrict address — verify transfer reverts; unrestrict and verify transfer succeeds
4. KYC flow — set verified, verify vault deposit works; revoke, verify deposit reverts
5. Vault deposit — approve + deposit NUSD, verify shares received
6. NAV update — post higher NAV, verify `convertToAssets` returns more than deposited
7. Vault withdraw — withdraw all, verify NUSD returned includes yield
8. Reserve report — post reserves, verify `getTotalReserves`
9. Audit log — write entry, verify event emitted
10. Mint controller ceiling — try to mint over allocation, verify revert
11. Factory — create new vault, verify registry
12. Pause — pause stablecoin, verify all transfers revert, unpause
13. Swap buy NUSD — send ETH, verify NUSD received
14. Swap sell NUSD — approve + sell NUSD, verify ETH returned
15. Buy vault shares with ETH — single tx, verify shares received
16. Sell vault shares for ETH — approve + sell, verify ETH returned
