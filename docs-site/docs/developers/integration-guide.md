# Integration Guide

How to integrate with Nexus Protocol: deposit NUSD, read vault state, subscribe to events, and build on derivatives.

---

## Depositing NUSD into a Vault

### Prerequisites

1. User address must be KYC-verified (if KYC is required on the vault)
2. User must not be on the RestrictionList
3. User must hold NUSD tokens
4. User must approve the vault to spend their NUSD

### Steps

```
// Step 1: Check compliance
transferRestrictions.isTransferAllowed(address(0), userAddress, amount)
// Returns true if user can receive vault shares

// Step 2: Approve vault to spend NUSD
nusd.approve(vaultAddress, depositAmount)

// Step 3: Deposit
yieldVault.deposit(depositAmount, receiverAddress)
// Returns: number of shares minted

// Step 4: Check position
yieldVault.balanceOf(userAddress)           // shares owned
yieldVault.convertToAssets(sharesOwned)     // current NUSD value
```

### Preview before depositing

```
yieldVault.previewDeposit(assets)    // shares you'd receive
yieldVault.previewMint(shares)       // assets needed for exact shares
yieldVault.maxDeposit(receiver)      // max deposit allowed
```

---

## Reading Vault State

### Current share price

```
totalAssets = yieldVault.totalAssets()    // from NAV oracle
totalSupply = yieldVault.totalSupply()   // total shares
sharePrice  = totalAssets / totalSupply
```

### User position value

```
sharesOwned = yieldVault.balanceOf(userAddress)
positionValue = yieldVault.convertToAssets(sharesOwned)
```

### Vault metadata

```
yieldVault.name()           // e.g., "Nexus Treasury Vault"
yieldVault.symbol()         // e.g., "nxTREASURY"
yieldVault.asset()          // deposit token address (NUSD)
yieldVault.totalAssets()    // total vault value
yieldVault.totalSupply()    // total shares in circulation
```

---

## Subscribing to Events

Key events to monitor for each contract:

### Vault events

| Event | When Emitted |
|-------|-------------|
| `Deposit(sender, owner, assets, shares)` | New deposit into vault |
| `Withdraw(sender, receiver, owner, assets, shares)` | Withdrawal from vault |
| `OracleUpdated(oldOracle, newOracle)` | Oracle reference changed |

### Stablecoin events

| Event | When Emitted |
|-------|-------------|
| `Transfer(from, to, value)` | Any NUSD transfer, mint, or burn |
| `Paused(account)` | Stablecoin paused |
| `Unpaused(account)` | Stablecoin unpaused |

### NAV oracle events

| Event | When Emitted |
|-------|-------------|
| `NAVUpdated(totalAssets, timestamp, reporter)` | New NAV posted |

### Compliance events

| Event | When Emitted |
|-------|-------------|
| `AddressRestricted(address)` | Address added to denylist |
| `AddressUnrestricted(address)` | Address removed from denylist |
| `KYCVerified(address, expiry)` | KYC granted |
| `KYCRevoked(address)` | KYC revoked |

### Derivative events

| Event | When Emitted |
|-------|-------------|
| `Split(user, vaultShares, ptAmount, ytAmount)` | Vault shares split into PT + YT |
| `Unsplit(user, ptAmount, vaultShares)` | PT + YT combined back to shares |
| `YieldDistributed(amount, navBefore, navAfter)` | Yield allocated to YT holders |
| `CollateralDeposited(user, shares)` | Collateral locked in CreditVault |
| `Borrowed(user, nusdAmount)` | NUSD borrowed against collateral |
| `Liquidated(borrower, liquidator, collateral, debt)` | Position liquidated |

---

## Using the ETH Swap Gateway

For users who hold ETH and want direct access to NUSD or vault shares:

### Buy NUSD with ETH

```
// Preview
ethAmount = parseEther("0.1")
nusdOut = gateway.quoteBuyNUSD(ethAmount)

// Execute (single tx, sends ETH)
gateway.buyNUSD(minNUSDOut, { value: ethAmount })
```

### Buy vault shares with ETH (single tx)

```
// Preview
nusdOut = gateway.quoteBuyNUSD(ethAmount)
sharesOut = vault.previewDeposit(nusdOut)

// Execute (single tx: ETH → NUSD → vault shares)
gateway.buyVaultShares(vaultAddress, minShares, { value: ethAmount })
```

### Sell NUSD for ETH

```
// Step 1: Approve gateway
nusd.approve(gatewayAddress, nusdAmount)

// Step 2: Execute
gateway.sellNUSD(nusdAmount, minETHOut)
```

---

## Building on Derivatives

### Integrating with YieldSplitter

```
// Split vault shares into PT + YT
vault.approve(yieldSplitterAddress, shareAmount)
yieldSplitter.split(shareAmount)

// Check PT/YT balances
pt.balanceOf(userAddress)
yt.balanceOf(userAddress)

// Distribute yield (anyone can call)
yieldSplitter.distributeYield()

// Claim yield as YT holder
yt.claimYield()

// After maturity: redeem
pt.approve(yieldSplitterAddress, ptAmount)
yieldSplitter.redeemPT(ptAmount)
```

### Integrating with CreditVault

```
// Deposit collateral
vault.approve(creditVaultAddress, shareAmount)
creditVault.depositCollateral(shareAmount)

// Borrow NUSD (max = collateralValue / 1.5)
creditVault.borrow(nusdAmount)

// Check LTV
creditVault.ltvRatio(borrowerAddress)  // in basis points

// Repay
nusd.approve(creditVaultAddress, repayAmount)
creditVault.repay(repayAmount)

// Withdraw collateral (must stay above ratio)
creditVault.withdrawCollateral(shareAmount)
```

### Integrating with ETFWrapper

```
// Deposit NUSD
nusd.approve(etfWrapperAddress, nusdAmount)
etfWrapper.deposit(nusdAmount)

// Check position
etfWrapper.balanceOf(userAddress)     // nxETF tokens
etfWrapper.pricePerToken()            // NUSD value per token
etfWrapper.totalNAV()                 // total basket value

// Withdraw
etfWrapper.approve(etfWrapperAddress, etfTokens)
etfWrapper.withdraw(etfTokens)
```

---

## REST API (Event Indexer)

The event indexer provides a REST API for querying indexed on-chain data.

### Base URL

```
http://localhost:3001/api    (local)
https://indexer.nexusprotocol.io/api   (production, planned)
```

### Endpoints

| Endpoint | Description |
|----------|------------|
| `GET /api/events?contract=<address>` | Events for a specific contract |
| `GET /api/vaults` | All vaults with TVL and APY |
| `GET /api/vault/:address` | Vault details |
| `GET /api/stablecoin/stats` | NUSD supply, transfers |
| `GET /api/split-positions?user=<address>` | PT/YT positions |
| `GET /api/credit-positions?user=<address>` | CreditVault positions |
| `GET /api/at-risk-positions` | Positions near liquidation |

See [API Reference](api-reference.md) for full request/response documentation.
