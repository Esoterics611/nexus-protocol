# Nexus Protocol — Manual Testing Guide

**Network:** Base Sepolia (Chain ID 84532)
**Frontend:** http://localhost:5173
**Admin wallet:** `0x41521c37dB02956185437C4e2461261A321073E1`

---

## 0. Prerequisites

### Start the frontend
```bash
cd C:\code\nexus-protocol\frontend
npm run dev
```
Open http://localhost:5173

### MetaMask setup
1. Open MetaMask → network dropdown → **Add network manually**
2. Fill in:
   - Network name: `Base Sepolia`
   - RPC URL: `https://sepolia.base.org`
   - Chain ID: `84532`
   - Symbol: `ETH`
   - Block explorer: `https://sepolia.basescan.org`
3. Switch to **Base Sepolia**
4. Import the admin account if not already there:
   - MetaMask → Add account → Import private key
   - Use the key from `C:\code\nexus-protocol\.env` (`DEPLOYER_PRIVATE_KEY`)

---

## 1. Connect Wallet

1. Go to http://localhost:5173
2. Click **[ CONNECT WALLET ]** in the top right
3. MetaMask will prompt — approve the connection
4. The button should change to show `0x4152...73e1` with a green dot
5. **Expected:** Stats row shows `ACTIVE VAULTS: 1` and the vault table shows `Nexus Treasury Vault / nxTREASURY`

---

## 2. Post a NAV Update (Admin → Oracle)

The vault share price starts at `$1.0000` and is driven by the NAV oracle. Post an update to confirm oracle is working.

1. Click **ADMIN** in the nav
2. Click **NAV ORACLE** card
3. In the **POST NAV UPDATE** panel:
   - Total Assets field: enter `1000000000000` (= 1,000,000 NUSD in 6 decimals)
4. Click **POST NAV**
5. MetaMask prompts — confirm the transaction
6. **Expected:** Toast shows success. The **LATEST NAV** panel updates to show `$1,000,000.000000` and the timestamp. NAV HISTORY table shows one row.

---

## 3. Mint NUSD (Admin → Mint)

The mint page routes through **MintController**, which enforces a per-minter ceiling. You must set an allocation for yourself before minting — even the deployer must do this.

### Step 3a — Set your allocation (right panel)
1. Click **ADMIN** → **MINT OPERATIONS**
2. In the **SET ALLOCATION** panel:
   - Minter Address: `0x41521c37dB02956185437C4e2461261A321073E1`
   - Ceiling (NUSD): `1000000` (= 1,000,000 NUSD)
3. Click **SET ALLOCATION** → confirm MetaMask
4. **Expected:** `MY CEILING` stat updates to `$1,000,000`

### Step 3b — Mint
1. In the **MINT NUSD** panel:
   - Recipient Address: `0x41521c37dB02956185437C4e2461261A321073E1` (pre-filled)
   - Amount: `10000` (= 10,000 NUSD)
2. Click **MINT** → confirm MetaMask
3. **Expected:** Toast success. `NUSD SUPPLY`, `MY MINTED`, and `REMAINING` stats all update.

---

## 4. Check Vault Page

1. Click **VAULTS** in the nav
2. **Expected:**
   - `TOTAL TVL` updates once you've deposited (currently `$0`)
   - Table shows `Nexus Treasury Vault / nxTREASURY / $1.0000 share price`
   - Click the row (or the `→` arrow) to open vault detail

---

## 5. Deposit into the Vault

The vault requires NUSD approval before depositing (ERC-4626 pattern).

1. From the vault detail page (`/vaults/0x6671...`)
2. Make sure the **DEPOSIT** tab is active
3. Enter amount: `1000` (= 1,000 NUSD)
4. Click **DEPOSIT**
5. MetaMask will fire **two transactions**:
   - First: `approve` — allow the vault to spend your NUSD
   - Second: `deposit` — send NUSD to vault, receive shares
6. Confirm both
7. **Expected:** Your position shows on the page. Share balance and value appear.

---

## 6. Check Portfolio Page

1. Click **PORTFOLIO** in the nav
2. **Expected:** Your vault position is listed — vault name, shares held, current value in NUSD

---

## 7. Withdraw from the Vault

1. Go back to the vault detail page
2. Click the **WITHDRAW** tab
3. Enter shares to redeem (or a NUSD amount, depending on UI)
4. Click **WITHDRAW**
5. Confirm in MetaMask
6. **Expected:** Shares are burned, NUSD returned to your wallet. Position updates on portfolio.

---

## 8. Admin → Compliance

### Test denylist (DENYLIST tab)
1. Go to **ADMIN** → **COMPLIANCE**
2. Select **[ DENYLIST ]** tab
3. In **CHECK** field: paste your own address → click CHECK
4. **Expected:** Shows `NOT RESTRICTED` in green
5. In **RESTRICT** field: paste a test address (e.g. `0x000000000000000000000000000000000000dEaD`) → click RESTRICT
6. Confirm MetaMask
7. Check that address again → **Expected:** Shows `RESTRICTED` in red
8. Unrestrict it → confirm MetaMask

### Test KYC (KYC tab)
1. Switch to **[ KYC ]** tab
2. Enter your address in the check field → **Expected:** Not KYC verified (false)
3. Verify an address: enter address + expiry timestamp (Unix, e.g. `1800000000`) → click VERIFY
4. Confirm MetaMask → check again → **Expected:** Verified = true

---

## 9. Admin → Reserves

Post a reserve entry to track backing:

1. Go to **ADMIN** → **RESERVES**
2. In **POST RESERVE UPDATE**:
   - Asset Type: select `T-Bill-3M`
   - Amount: `1000000000000` (= 1,000,000 USD in 6 decimals)
3. Click **POST RESERVE**
4. Confirm MetaMask
5. **Expected:** Stats update — `TOTAL RESERVES` shows the amount. Reserve ratio = Reserves / NUSD Supply × 100%. If supply = 10,000 NUSD and reserves = 1,000,000 NUSD, ratio shows `10000.00%` (green, >= 100%).

---

## 10. Admin → System Status Dashboard

1. Click **ADMIN** in nav
2. **Expected (with wallet connected):**
   - `RESERVE RATIO` — calculated from on-chain data
   - `ORACLE AGE` — time since last NAV post (e.g. `3m ago`)
   - `PROTOCOL STATUS` — `ACTIVE` with pulsing green dot
   - Four operation cards (MINT, COMPLIANCE, ORACLE, RESERVES) — all clickable

---

## 11. Landing Page Stats

Go back to `/` (click NEXUS PROTOCOL logo):
- **TOTAL VALUE LOCKED** — sum of all vault assets
- **NUSD SUPPLY** — total minted NUSD
- **ACTIVE VAULTS** — should show `1`
- Vault table shows `Nexus Treasury Vault` with live TVL and share price

---

## Known Behaviours (Not Bugs)

| Behaviour | Reason |
|---|---|
| Stats show `$0` until wallet connected | Frontend loads live data after connect |
| Two MetaMask popups on first deposit | ERC-20 approve + deposit are separate transactions |
| `ORACLE AGE` goes stale after ~24h | Expected — NAV must be posted daily |
| Mint fails with "smart contract rejected" | MintController requires a ceiling to be set first — do Step 3a (SET ALLOCATION) before minting |
| Share price stays `$1.0000` | Share price = totalAssets / totalSupply; if no deposits yet, defaults to 1.0 |
| Wallet disconnects on page refresh | In-memory only — one click to reconnect (MetaMask stays unlocked) |

---

## Useful Basescan Links

| | |
|---|---|
| NUSD Stablecoin | https://sepolia.basescan.org/address/0x82671ab3119c8f73acc0ee43c6b167b46b948141 |
| YieldVault | https://sepolia.basescan.org/address/0x6671D7937ae8b9120A673724FD26CF06e61b4F67 |
| NAVOracle | https://sepolia.basescan.org/address/0x28dc5ccc6a97675b7def7b4c4179b85127b698f3 |
| Admin wallet txs | https://sepolia.basescan.org/address/0x41521c37dB02956185437C4e2461261A321073E1 |
