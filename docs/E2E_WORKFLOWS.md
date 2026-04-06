# Nexus Protocol — End-to-End Workflows

> Post-deployment user workflows for testnet and production operations.

---

## Workflow 1: Protocol Deployment & Initialization

**Who:** Protocol Admin (deployer)
**When:** First-time setup on any chain

```
1. Deploy all contracts
   $ npx hardhat run scripts/deploy.ts --network baseSepolia

2. Save all addresses from deployment summary → CONTRACT_REGISTRY.md

3. Initialize roles:
   - Grant REPORTER_ROLE on NAVOracle → oracle reporter address (multisig or bot)
   - Grant VERIFIER_ROLE on KYCRegistry → KYC service address
   - Grant RESTRICTOR_ROLE on RestrictionList → compliance service address
   - Grant ALLOCATOR_ROLE on MintController → authorized mint allocators

4. ⚠️  Set MintController allocations BEFORE any minting:
   - MintController.setMintAllocation(minterAddress, ceilingAmount)
   - This MUST be done for EVERY minter address, including the deployer
   - The UI's MINT page routes through MintController — no allocation = "smart contract rejected"
   - Example: setMintAllocation(deployerAddress, 1_000_000e6)  // 1M NUSD ceiling

5. Configure compliance:
   - TransferRestrictions.setKYCRequired(true) if requiring KYC
   - Import initial OFAC denylist → RestrictionList.batchRestrict([...])

6. Set initial NAV:
   - NAVOracle.postNAV(initialAssets, timestamp)

7. Verify on Basescan:
   $ npx hardhat verify --network baseSepolia <address> <constructor args>
```

---

## Workflow 2: Stablecoin Minting (Institutional Flow)

**Who:** Minter (institutional partner)
**Actors:** Admin → Allocator → Minter → End User

> ⚠️ **CEILING REQUIRED FIRST**: The UI mint page calls `MintController.mint()`, NOT
> `NexusStableCoin.mint()` directly. MintController enforces a per-minter ceiling —
> if no allocation is set for an address, the call reverts immediately. This applies
> to the deployer too. Always run Step 1 before attempting any mint.

```
Step 1 (REQUIRED): Admin sets minter allocation
  └── MintController.setMintAllocation(minterAddress, 10_000_000e6)
      → Minter can now mint up to $10M NUSD
      → Skip this = "smart contract rejected" on every mint attempt

  UI: Admin → MINT OPERATIONS → SET ALLOCATION panel
      - Minter Address: paste minter's address
      - Ceiling (NUSD): e.g. 1000000 (= $1,000,000)
      - Click SET ALLOCATION → confirm MetaMask

Step 2: Customer sends USD wire to partner bank
  └── (Off-chain) Bank confirms receipt
  └── bank-adapter notifies system

Step 3: Minter mints NUSD to customer
  └── MintController.mint(customerAddress, amount)
      ├── Checks allocation ceiling
      ├── Deducts from allocation
      └── NexusStableCoin.mint(customer, amount)
          └── RestrictionList check on customer (must not be denied)

Step 4: Customer receives NUSD
  └── Can transfer, deposit into vault, or hold

Step 5: Customer redeems (burn flow)
  └── NexusStableCoin.burn(customer, amount) [BURNER_ROLE required]
  └── (Off-chain) Initiate wire to customer bank account
```

**UI Screens Needed:**
- Mint dashboard: current allocation, remaining, mint history
- Mint form: recipient address, amount, confirm
- Burn form: from address, amount, confirm
- Allocation management: set/reset per minter

---

## Workflow 3: Treasury Vault Deposit & Yield

**Who:** Investor (KYC'd address)
**Actors:** Investor → YieldVault → NAVOracle (automated)

```
Step 1: Investor gets KYC'd
  └── (Off-chain) Complete identity verification
  └── KYCRegistry.setVerified(investor, expiryTimestamp)

Step 2: Investor approves NUSD spending
  └── NexusStableCoin.approve(yieldVault, amount)

Step 3: Investor deposits into vault
  └── YieldVault.deposit(assets, receiver)
      ├── TransferRestrictions.isTransferAllowed(0x0, receiver, shares) → checks KYC + denylist
      ├── Transfers NUSD from investor → vault
      └── Mints vault shares (nxTREASURY) to investor

Step 4: Yield accrues (daily)
  └── Oracle reporter posts updated NAV
      └── NAVOracle.postNAV(newTotalAssets, timestamp)
      → Share price increases: totalAssets / totalSupply

Step 5: Investor checks position
  └── YieldVault.convertToAssets(sharesOwned) → current value in NUSD
  └── Compare with original deposit to see yield earned

Step 6: Investor withdraws
  └── YieldVault.withdraw(assets, receiver, owner)
      ├── Burns vault shares
      └── Transfers NUSD (including yield) to investor

Example:
  - Deposit 100,000 NUSD → receive 100,000 nxTREASURY shares
  - After 1 year at 4.5% APY, NAV increases 4.5%
  - 100,000 shares now worth 104,500 NUSD
  - Withdraw all → receive 104,500 NUSD
```

**UI Screens Needed:**
- Vault overview: TVL, current APY, share price, your position
- Deposit form: amount, preview shares, confirm
- Withdraw form: shares or assets, preview output, confirm
- Yield history chart: share price over time
- Portfolio summary: all positions across vaults

---

## Workflow 4: NAV Oracle Reporting (Operator Flow)

**Who:** Oracle Reporter (bot or multisig)
**Frequency:** Daily (matching T-bill yield accrual)

```
Step 1: Fetch current T-bill yields
  └── (Off-chain) oracle-reporter service fetches from:
      - Treasury Direct API
      - Bloomberg/Reuters feed
      - Fund administrator API

Step 2: Calculate new NAV
  └── newNAV = previousNAV * (1 + dailyYield)
  └── Example: $1,000,000 * (1 + 0.045/365) = $1,000,123.29

Step 3: Post to oracle
  └── NAVOracle.postNAV(newNAV_scaled, timestamp)
      ├── Validates timestamp >= last
      ├── Stores in history
      └── Emits NAVUpdated event

Step 4: Verify
  └── NAVOracle.getLatestNAV() → confirm new values
  └── Compare with expected yield rate

Step 5: Log to audit trail
  └── AuditLog.log("NAV_UPDATE", "Daily NAV posted", encodedData)
```

**UI Screens Needed:**
- Oracle dashboard: latest NAV, history chart, reporter address
- Manual NAV posting form (for admin override)
- NAV comparison view: oracle vs expected vs actual reserves

---

## Workflow 5: Compliance Operations

**Who:** Compliance Officer
**Ongoing:** As needed

### 5a: Address Screening (Sanctions)
```
1. Receive OFAC SDN list update (daily)
   └── (Off-chain) sanctions-screener compares new list

2. New sanctioned address found
   └── RestrictionList.restrict(sanctionedAddress)
   └── AuditLog.log("SANCTIONS", "Address restricted", address)

3. Address cleared
   └── RestrictionList.unrestrict(address)
   └── AuditLog.log("SANCTIONS", "Address unrestricted", address)

4. Bulk update
   └── RestrictionList.batchRestrict([addr1, addr2, ...])
```

### 5b: KYC Management
```
1. New user applies → (off-chain) KYC provider verifies
2. Verification passed → KYCRegistry.setVerified(user, expiry)
3. KYC expires → user must re-verify
4. Suspicious activity → KYCRegistry.revokeVerification(user)
5. Batch onboarding → KYCRegistry.batchSetVerified([users], expiry)
```

### 5c: Accredited Investor
```
1. Verify accreditation (off-chain)
2. AccreditedInvestor.setAccredited(investor, true)
3. Required for certain vault products (e.g., structured products in Phase 2)
```

**UI Screens Needed:**
- Denylist management: search, add, remove, bulk import
- KYC dashboard: pending, verified, expired, revoked
- KYC detail view: status, expiry, verification date
- Compliance alerts: expiring KYC, new sanctions matches

---

## Workflow 6: Reserve Tracking & Audit

**Who:** Reserve Reporter / Auditor
**Frequency:** Daily reserves, monthly audit

```
Step 1: Report reserve composition
  └── ReserveTracker.postReserve("T-Bill-3M", 500_000e6)
  └── ReserveTracker.postReserve("T-Bill-6M", 300_000e6)
  └── ReserveTracker.postReserve("USDC", 200_000e6)

Step 2: Verify reserve ratio
  └── totalReserves = ReserveTracker.getTotalReserves()
  └── totalSupply = NexusStableCoin.totalSupply()
  └── ratio = totalReserves / totalSupply (should be >= 1.0)

Step 3: Generate audit report
  └── (Off-chain) audit-reporter pulls:
      - Reserve composition from ReserveTracker
      - Supply data from stablecoin
      - NAV history from NAVOracle
      - All AuditLog events for the period

Step 4: Publish attestation
  └── AuditLog.log("AUDIT", "Monthly attestation", reportHash)
```

**UI Screens Needed:**
- Reserve dashboard: composition pie chart, total, reserve ratio
- Reserve history: time series of reserve changes
- Audit report generator: date range, export PDF
- Reserve vs supply comparison chart

---

## Workflow 7: Vault Factory (Creating New Products)

**Who:** Protocol Admin
**When:** Launching new vault product

```
Step 1: Deploy new NAVOracle for the product
  └── Or reuse existing one if same underlying

Step 2: Create vault via factory
  └── YieldVaultFactory.createVault(
        depositToken,   // NUSD or USDC
        oracleAddress,  // NAVOracle for this asset class
        "Nexus Corporate Bond Vault",
        "nxCORP"
      )

Step 3: Configure vault
  └── vault.setTransferRestrictions(transferRestrictions.address)
  └── Grant roles on the new vault

Step 4: Seed oracle with initial NAV
  └── newOracle.postNAV(initialAssets, timestamp)

Step 5: List in UI
  └── Factory tracks all vaults: getVaultCount(), getVault(i), isVault(addr)
```

**UI Screens Needed:**
- Vault factory: create new vault form
- Vault directory: list all vaults from factory, TVL, APY, status
- Vault admin: configure restrictions, oracle, roles per vault

---

## Workflow 8: Buy NUSD with ETH (Swap Gateway)

**Who:** Any user with a wallet and Base Sepolia ETH
**Actors:** User → ETHSwapGateway → NexusStableCoin

```
Step 1: User navigates to /swap → selects "BUY NUSD"

Step 2: User enters ETH amount
  └── Frontend calls: ETHSwapGateway.quoteBuyNUSD(ethWei) → preview NUSD out
  └── Display: "1 ETH = $2,800 NUSD" (live from oracle)

Step 3: User clicks "Buy NUSD" → wallet prompts single tx
  └── ETHSwapGateway.buyNUSD(minNUSDOut) { value: ethWei }
      ├── Reads price from MockPriceFeed.latestAnswer()
      ├── Calculates nusdOut = ethWei * price / 1e20
      ├── Checks nusdOut >= minNUSDOut (slippage guard)
      ├── NexusStableCoin.mint(user, nusdOut)   ← gateway has MINTER_ROLE
      └── ETH stays in gateway as redemption reserve

Step 4: User receives NUSD
  └── wallet balance updates, /swap page reloads balances
```

**Price math example:**
- Send 0.1 ETH, price = $2800
- nusdOut = (0.1 × 10¹⁸) × (2800 × 10⁸) / 10²⁰ = 280 × 10⁶ = 280.000000 NUSD

---

## Workflow 9: Sell NUSD for ETH (Swap Gateway)

**Who:** Any user holding NUSD
**Actors:** User → NexusStableCoin.approve() → ETHSwapGateway → NexusStableCoin.burn()

```
Step 1: User navigates to /swap → selects "SELL NUSD"

Step 2: User enters NUSD amount
  └── Frontend calls: ETHSwapGateway.quoteSellNUSD(nusdAmount) → preview ETH out
  └── Display: "2800 NUSD ≈ 1 ETH"

Step 3: User clicks "Approve & Sell NUSD" → wallet prompts TWO txs

  Tx 1: NexusStableCoin.approve(gatewayAddress, nusdAmount)
    └── Grants gateway permission to pull NUSD

  Tx 2: ETHSwapGateway.sellNUSD(nusdAmount, minETHOut)
    ├── Calculates ethOut = nusdAmount * 1e20 / price
    ├── Checks ethOut >= minETHOut (slippage guard)
    ├── Checks address(this).balance >= ethOut (reserve check)
    ├── IERC20(nusd).transferFrom(user, gateway, nusdAmount)
    ├── NexusStableCoin.burn(gateway, nusdAmount)  ← gateway has BURNER_ROLE
    └── Sends ethOut ETH to user

Step 4: User receives ETH, NUSD is burned (supply reduced)
```

⚠️ **Reserve dependency:** Sell flow requires the gateway to hold enough ETH.
Current reserve: 0.05 ETH (~$140 worth of NUSD redemptions at $2800).
Top up via `scripts/setupGateway.ts` or direct ETH transfer to gateway address.

---

## Workflow 10: Buy Vault Shares Directly with ETH

**Who:** Any user with ETH who wants yield exposure in one transaction
**Actors:** User → ETHSwapGateway → NexusStableCoin.mint() → YieldVault.deposit()

```
Step 1: User opens vault detail page (/vaults/0x6671...)
  └── Wallet connected → "BUY ETH" tab appears in action card

Step 2: User enters ETH amount
  └── Frontend: quoteBuyNUSD(ethWei) → previewDeposit(nusd) → estimated shares

Step 3: Single transaction: ETHSwapGateway.buyVaultShares(vaultAddr, minShares) { value: ethWei }
  ├── nusdAmount = ethWei * price / 1e20
  ├── NexusStableCoin.mint(gateway, nusdAmount)
  ├── NexusStableCoin.approve(vault, nusdAmount)
  ├── YieldVault.deposit(nusdAmount, user)   ← shares minted directly to user
  └── Checks sharesOut >= minShares

Step 4: User receives nxTREASURY vault shares
  └── Position visible on /portfolio and vault detail page
```

**One-tx flow summary:** ETH in → nxTREASURY shares out. No separate NUSD step.

---

## Workflow 11: Sell Vault Shares for ETH

**Who:** Investor wanting to exit position back to ETH
**Actors:** User → YieldVault.approve() → ETHSwapGateway → YieldVault.redeem() → NexusStableCoin.burn()

```
Step 1: User opens vault detail page → "SELL ETH" tab

Step 2: User enters share amount
  └── Frontend: previewRedeem(shares) → quoteSellNUSD(nusd) → estimated ETH out

Step 3: Tx 1: YieldVault.approve(gatewayAddress, shares)

Step 4: Tx 2: ETHSwapGateway.sellVaultShares(vaultAddr, shares, minETHOut)
  ├── YieldVault.redeem(shares, gateway, user)  ← pulls shares from user, sends NUSD to gateway
  ├── ethOut = nusdReceived * 1e20 / price
  ├── Checks ethOut >= minETHOut
  ├── NexusStableCoin.burn(gateway, nusdReceived)
  └── Sends ethOut ETH to user

Step 5: User receives ETH, shares burned, NUSD burned
```

---

## Post-Deployment Testnet Checklist

After deploying to Base Sepolia, verify each workflow in order:

- [ ] **Set MintController allocation** ← MUST be done before any mint attempt
      Admin → MINT OPERATIONS → SET ALLOCATION → minter=deployer, ceiling=1000000
- [ ] **Mint NUSD**: With allocation set, mint NUSD → verify balance and stats update
- [ ] **Restrict address**: Add to denylist, verify transfer reverts, remove, verify transfer succeeds
- [ ] **KYC flow**: Set verified, verify vault deposit works. Revoke, verify deposit reverts.
- [ ] **Vault deposit**: Approve + deposit NUSD, verify shares received
- [ ] **NAV update**: Post higher NAV, verify `convertToAssets` returns more than deposited
- [ ] **Vault withdraw**: Withdraw all, verify NUSD returned includes yield
- [ ] **Reserve report**: Post reserves, verify getTotalReserves
- [ ] **Audit log**: Write entry, verify event emitted
- [ ] **Mint controller ceiling**: Try to mint over allocation, verify revert
- [ ] **Factory**: Create new vault, verify registry
- [ ] **Pause**: Pause stablecoin, verify all transfers revert, unpause
- [ ] **Swap buy NUSD**: Send 0.01 ETH → verify NUSD received = 0.01 × $2800 = $28
- [ ] **Swap sell NUSD**: Approve + sell 28 NUSD → verify ~0.01 ETH returned
- [ ] **Buy vault shares with ETH**: Send ETH on vault page BUY ETH tab → verify nxTREASURY shares received
- [ ] **Sell vault shares for ETH**: Approve shares + SELL ETH tab → verify ETH returned

---

## Workflow 8: Yield Splitter — Split Position into PT + YT, Redeem at Maturity

**Who:** Investor
**When:** Before maturity to separate principal from yield; at maturity to redeem

**Prerequisites:** Vault shares in wallet (complete Workflow 4 first)

```
1. Navigate to /derivatives/splitter

2. Split vault shares
   - Enter share amount in "SPLIT VAULT SHARES"
   - Click "Approve & Split"
   - Tx 1: vault.approve(yieldSplitter, amount)
   - Tx 2: yieldSplitter.split(amount)
   - Result: receive equal PT + YT (6 decimals each)

3. Verify balances update
   - YOUR POSITION shows PT Balance + YT Balance

4. (Optional) Distribute accrued yield
   - Click "Distribute Yield" — anyone can call, snapshots NAV delta
   - YT holders' yieldOwed increases pro-rata

5. (Optional) Exit early — unsplit
   - Enter PT amount in "UNSPLIT (EXIT EARLY)"
   - Click "Approve & Unsplit" (approves both PT and YT, then calls unsplit)
   - Result: receive vault shares back, forfeit yield already distributed

6. At maturity — redeem PT
   - Enter PT balance in "REDEEM PT"
   - Click "Approve & Redeem PT"
   - Tx 1: pt.approve(yieldSplitter, ptAmount)
   - Tx 2: yieldSplitter.redeemPT(ptAmount)
   - Result: NUSD returned pro-rata of available assets

7. At maturity — redeem YT
   - Enter YT balance in "REDEEM YT"
   - Click "Approve & Redeem YT"
   - Result: NUSD yield returned (accrued via distributeYield calls)
```

**Key invariants to check:**
- PT + YT minted = vault share value in NUSD (1:1)
- After maturity: PT holders get principal, YT holders get all yield above principal
- distributeYield() can be called multiple times (cumulative, idempotent per NAV snapshot)

---

## Workflow 9: Credit Vault — Deposit Collateral → Borrow → Repay → Withdraw

**Who:** Borrower
**When:** To leverage vault position or get liquidity without selling

**Prerequisites:** Vault shares in wallet (complete Workflow 4 first)

```
1. Navigate to /derivatives/credit

2. Deposit collateral
   - Enter vault share amount in "DEPOSIT COLLATERAL"
   - Click "Approve & Deposit"
   - Tx 1: vault.approve(creditVault, shares)
   - Tx 2: creditVault.depositCollateral(shares)
   - Result: shares locked, collateral shown in position

3. Borrow NUSD
   - Enter NUSD amount (max = collateralValue / 1.5)
   - Click "Borrow"
   - Result: NUSD transferred to wallet, LTV updates

4. Monitor LTV
   - Page polls every 12s — watch LTV indicator
   - Green = safe, Orange = approaching liquidation (>10% LTV)
   - Red = below liquidation threshold (120%) — action required

5. Repay debt
   - Enter NUSD amount in "REPAY DEBT"
   - Click "Approve & Repay"
   - Tx 1: nusd.approve(creditVault, amount)
   - Tx 2: creditVault.repay(amount)
   - Note: interest accrues continuously — repay slightly more than shown debt

6. Withdraw collateral
   - Enter share amount in "WITHDRAW COLLATERAL"
   - Click "Withdraw"
   - Reverts if withdrawal makes position undercollateralized
```

**Liquidation scenario:**
```
If LTV exceeds 120% (NAV drops or interest accrues):
- Any address can call creditVault.liquidate(borrowerAddress)
- Liquidator repays full debt → receives all collateral shares at face value
- Borrower position cleared
- To liquidate via UI: not yet wired — call contract directly or via Etherscan
```

**Key numbers:**
- Collateral ratio: 150% (max borrow = 66.7% of collateral value)
- Liquidation: 120% LTV
- Borrow rate: 5% APY (accrues per second)

---

## Workflow 10: ETF Wrapper — Deposit into Basket, Withdraw

**Who:** Investor
**When:** To get diversified vault exposure in a single token

**Prerequisites:** NUSD balance (complete Workflow 2 first)

```
1. Navigate to /derivatives/etf

2. View vault composition
   - Left panel shows all vaults with their weight %
   - Currently: nxTREASURY 100%

3. Deposit NUSD
   - Enter NUSD amount in "DEPOSIT"
   - Click "Approve & Deposit"
   - Tx 1: nusd.approve(etfWrapper, amount)
   - Tx 2: etfWrapper.deposit(amount)
   - Result: NUSD split across vaults per weights, nxETF tokens minted
   - Shares received = nusdAmount * totalSupply / totalNAV (or 1:1 if first depositor)

4. Verify position
   - YOUR POSITION shows nxETF balance + current USD value
   - Price/token updates as underlying vault NAVs change

5. Withdraw
   - Enter nxETF amount in "WITHDRAW"
   - Click "Approve & Withdraw"
   - Tx 1: etfWrapper.approve(etfWrapper, amount)  ← self-approve for internal accounting
   - Tx 2: etfWrapper.withdraw(etfTokens)
   - Result: pro-rata NUSD returned from all underlying vaults
```

**Key invariants to check:**
- totalNAV = sum of vault.convertToAssets(etfWrapper.balance) across all vaults
- pricePerToken = totalNAV / totalSupply (6 decimals)
- After deposit + immediate withdraw: receive ≈ deposited amount (no slippage if no NAV change)
