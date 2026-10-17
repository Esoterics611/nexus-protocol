# Contract Reference

Every contract in the protocol: purpose, key functions, events, and required roles. Organized by module.

---

## Vault Module (`contracts/vaults/`)

### YieldVault

**Purpose:** ERC-4626 tokenized vault that accepts an ERC-20 deposit token and prices shares via an NAV oracle.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `deposit(assets, receiver)` | Public | Deposit NUSD, receive vault shares |
| `withdraw(assets, receiver, owner)` | Public | Burn shares, receive NUSD |
| `redeem(shares, receiver, owner)` | Public | Redeem exact share amount for NUSD |
| `totalAssets()` | Public (view) | Returns oracle NAV or token balance fallback |
| `convertToAssets(shares)` | Public (view) | Preview NUSD value of shares |
| `convertToShares(assets)` | Public (view) | Preview shares for a given NUSD amount |
| `setOracle(address)` | ORACLE_ROLE | Update the NAV oracle reference |
| `setTransferRestrictions(address)` | ADMIN_ROLE | Set the transfer restrictions module |

**Events:**

| Event | Parameters |
|-------|-----------|
| `OracleUpdated` | `oldOracle`, `newOracle` |
| `TransferRestrictionsUpdated` | `oldRestrictions`, `newRestrictions` |
| `Deposit` (ERC-4626) | `sender`, `owner`, `assets`, `shares` |
| `Withdraw` (ERC-4626) | `sender`, `receiver`, `owner`, `assets`, `shares` |

**Roles:** `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE`, `ORACLE_ROLE`

---

### NAVOracle

**Purpose:** On-chain oracle for Net Asset Value reporting. Stores an append-only history of NAV snapshots.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `postNAV(totalAssets, timestamp)` | REPORTER_ROLE | Post a new NAV snapshot |
| `getLatestNAV()` | Public (view) | Returns latest (totalAssets, timestamp, reporter) |
| `getHistoryLength()` | Public (view) | Number of entries in history |
| `getEntry(index)` | Public (view) | Specific historical entry |

**Events:**

| Event | Parameters |
|-------|-----------|
| `NAVUpdated` | `totalAssets`, `timestamp`, `reporter` |

**Roles:** `DEFAULT_ADMIN_ROLE`, `REPORTER_ROLE`

---

### YieldVaultFactory

**Purpose:** Factory for creating new YieldVault instances with standard configuration.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `createVault(depositToken, oracle, name, symbol)` | DEFAULT_ADMIN_ROLE | Deploy a new vault |
| `getVaultCount()` | Public (view) | Number of vaults created |
| `getVault(index)` | Public (view) | Vault address by index |
| `isVault(address)` | Public (view) | Check if address is a factory-created vault |

**Roles:** `DEFAULT_ADMIN_ROLE`

---

## Stablecoin Module (`contracts/stablecoin/`)

### NexusStableCoin

**Purpose:** UUPS-upgradeable ERC-20 stablecoin with 6 decimals, ERC-2612 permit, pause, and transfer restrictions.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `initialize(name, symbol, admin)` | Once (initializer) | Initialize the proxy |
| `mint(to, amount)` | MINTER_ROLE | Mint new NUSD |
| `burn(from, amount)` | BURNER_ROLE | Burn NUSD from any address |
| `pause()` | PAUSER_ROLE | Halt all transfers |
| `unpause()` | PAUSER_ROLE | Resume transfers |
| `setRestrictionList(address)` | RESTRICTOR_ROLE | Update the denylist reference |
| `decimals()` | Public (view) | Returns `6` |

**Events:**

| Event | Parameters |
|-------|-----------|
| `RestrictionListUpdated` | `oldList`, `newList` |
| `Transfer` (ERC-20) | `from`, `to`, `value` |
| `Paused` | `account` |
| `Unpaused` | `account` |

**Roles:** `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `BURNER_ROLE`, `PAUSER_ROLE`, `RESTRICTOR_ROLE`

---

### MintController

**Purpose:** Two-tier allocation system. Allocators set per-minter ceilings; minters mint within their ceiling.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `setMintAllocation(minter, ceiling)` | ALLOCATOR_ROLE | Set max mint amount for an address |
| `mint(to, amount)` | Any (with allocation) | Mint NUSD through the controller |
| `resetMintedAmount(minter)` | ADMIN_ROLE | Reset consumed allocation to zero |
| `remainingAllocation(minter)` | Public (view) | Ceiling minus minted |
| `mintAllocation(minter)` | Public (view) | Current ceiling |
| `mintedAmount(minter)` | Public (view) | Amount already minted |

**Events:**

| Event | Parameters |
|-------|-----------|
| `AllocationSet` | `minter`, `ceiling` |
| `MintExecuted` | `minter`, `to`, `amount` |

**Roles:** `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE`, `ALLOCATOR_ROLE`

!!! warning "Required Before Minting"
    `setMintAllocation()` MUST be called for every minter address before any mint attempt. Without an allocation, `mint()` reverts.

---

### RestrictionList

**Purpose:** Global denylist shared across all protocol tokens.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `restrict(address)` | RESTRICTOR_ROLE | Add to denylist |
| `unrestrict(address)` | RESTRICTOR_ROLE | Remove from denylist |
| `batchRestrict(addresses[])` | RESTRICTOR_ROLE | Bulk add |
| `isRestricted(address)` | Public (view) | Check denylist status |

**Roles:** `DEFAULT_ADMIN_ROLE`, `RESTRICTOR_ROLE`

---

## Compliance Module (`contracts/compliance/`)

### TransferRestrictions

**Purpose:** Modular transfer gate composing denylist + KYC checks. Implements `ITransferRestrictions`.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `isTransferAllowed(from, to, amount)` | Public (view) | Returns true if transfer is permitted |
| `setRestrictionList(address)` | DEFAULT_ADMIN_ROLE | Update denylist reference |
| `setKYCRegistry(address)` | DEFAULT_ADMIN_ROLE | Update KYC reference |
| `setKYCRequired(bool)` | DEFAULT_ADMIN_ROLE | Toggle KYC enforcement |

**Events:** `RestrictionListUpdated`, `KYCRegistryUpdated`, `KYCRequirementUpdated`

**Roles:** `DEFAULT_ADMIN_ROLE`

---

### KYCRegistry

**Purpose:** On-chain KYC verification registry with time-bounded expiry.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `setVerified(address, expiry)` | VERIFIER_ROLE | Grant KYC with expiry timestamp |
| `revokeVerification(address)` | VERIFIER_ROLE | Immediately revoke |
| `batchSetVerified(addresses[], expiry)` | VERIFIER_ROLE | Bulk onboarding |
| `isVerified(address)` | Public (view) | Check verified AND not expired |

**Roles:** `DEFAULT_ADMIN_ROLE`, `VERIFIER_ROLE`

---

### AccreditedInvestor

**Purpose:** Standalone registry for accredited investor status.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `setAccredited(address, bool)` | VERIFIER_ROLE | Set/revoke accreditation |
| `isAccredited(address)` | Public (view) | Check status |

**Roles:** `DEFAULT_ADMIN_ROLE`, `VERIFIER_ROLE`

---

## Accounting Module (`contracts/accounting/`)

### AuditLog

**Purpose:** Immutable on-chain audit trail via events. No contract storage — gas-efficient.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `log(category, message, data)` | LOGGER_ROLE | Write an audit entry |

**Events:**

| Event | Parameters |
|-------|-----------|
| `AuditEntry` | `entryId`, `category`, `message`, `data`, `logger`, `timestamp` |

**Roles:** `DEFAULT_ADMIN_ROLE`, `LOGGER_ROLE`

---

### ReserveTracker

**Purpose:** On-chain reserve composition tracking with full history.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `postReserve(assetType, amount)` | REPORTER_ROLE | Post a reserve entry |
| `getTotalReserves()` | Public (view) | Sum of latest entries per asset type |
| `getLatestReserve(assetType)` | Public (view) | Latest entry for specific asset |
| `getReserveHistory()` | Public (view) | Full history |

**Roles:** `DEFAULT_ADMIN_ROLE`, `REPORTER_ROLE`

---

## Derivatives Module (`contracts/derivatives/`)

### YieldSplitter

**Purpose:** Strips ERC-4626 vault shares into Principal Tokens (PT) and Yield Tokens (YT).

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `split(vaultShares)` | Public | Deposit shares, receive PT + YT |
| `unsplit(ptAmount)` | Public | Burn PT + YT, get shares back (before maturity) |
| `distributeYield()` | Public | Snapshot NAV delta, allocate to YT holders |
| `redeemPT(ptAmount)` | Public | After maturity: burn PT, receive NUSD 1:1 |
| `redeemYT(ytAmount)` | Public | After maturity: burn YT, receive accrued yield |

**Events:** `Split`, `Unsplit`, `YieldDistributed`, `PTRedeemed`, `YTRedeemed`

**Key state:** `vault` (immutable), `maturity` (immutable), `totalVaultShares`, `assetsAtLastUpdate`, `totalYieldDistributed`

---

### PrincipalToken

**Purpose:** ERC-20 representing a fixed 1:1 claim on NUSD at maturity.

**Key functions:** `mint()`, `burn()` (MINTER_ROLE — YieldSplitter only)

**Immutables:** `maturity`, `underlying` (NUSD address)

---

### YieldToken

**Purpose:** ERC-20 capturing all vault yield until maturity.

**Key functions:** `mint()`, `burn()` (MINTER_ROLE — YieldSplitter only), `claimYield()`

**Immutables:** `maturity`, `splitter`

---

### CreditVault

**Purpose:** Collateralized lending — deposit vault shares, borrow NUSD.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `depositCollateral(shares)` | Public | Lock vault shares as collateral |
| `borrow(nusdAmount)` | Public | Borrow NUSD (must stay above collateral ratio) |
| `repay(nusdAmount)` | Public | Repay debt |
| `withdrawCollateral(shares)` | Public | Withdraw (must stay above collateral ratio) |
| `liquidate(borrower)` | Public | Liquidate undercollateralized position |
| `ltvRatio(borrower)` | Public (view) | Current LTV in basis points |
| `fundLiquidity(amount)` | ADMIN_ROLE | Supply NUSD for lending |

**Events:** `CollateralDeposited`, `Borrowed`, `Repaid`, `CollateralWithdrawn`, `Liquidated`

**Parameters:** `collateralRatioBps` (150%), `liquidationRatioBps` (120%), `borrowRateBps` (5%), `liquidationDiscountBps` (5%)

---

### ETFWrapper

**Purpose:** Basket product — one ERC-20 token backed by weighted allocations across multiple vaults.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `deposit(nusdAmount)` | Public | Deposit NUSD, receive nxETF tokens |
| `withdraw(etfTokens)` | Public | Burn nxETF, receive NUSD from all vaults |
| `totalNAV()` | Public (view) | Sum of underlying vault values |
| `pricePerToken()` | Public (view) | totalNAV / totalSupply |
| `rebalance()` | REBALANCER_ROLE | Restore target weight allocations |

**Events:** `Deposited`, `Withdrawn`, `Rebalanced`

---

## Gateway Module (`contracts/gateway/`)

### ETHSwapGateway

**Purpose:** Buy/sell NUSD and vault shares with ETH in one transaction.

**Key functions:**

| Function | Access | Description |
|----------|--------|-------------|
| `buyNUSD(minNUSDOut)` | Public (payable) | Send ETH, receive NUSD |
| `sellNUSD(nusdAmount, minETHOut)` | Public | Send NUSD, receive ETH |
| `buyVaultShares(vault, minShares)` | Public (payable) | Send ETH, receive vault shares |
| `sellVaultShares(vault, shares, minETHOut)` | Public | Send vault shares, receive ETH |
| `quoteBuyNUSD(ethWei)` | Public (view) | Preview NUSD output |
| `quoteSellNUSD(nusdAmount)` | Public (view) | Preview ETH output |

**Requires:** MINTER_ROLE + BURNER_ROLE on NexusStableCoin.

### MockPriceFeed

**Purpose:** Admin-settable ETH/USD price feed for testnet.

**Key functions:** `latestAnswer()` (view), `setPrice(int256)` (admin)
