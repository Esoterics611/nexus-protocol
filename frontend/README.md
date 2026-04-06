# Nexus Protocol — Frontend

SvelteKit UI for the Nexus Protocol institutional digital asset suite. Connects to the deployed smart contracts on localhost or Base Sepolia via viem + MetaMask.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Wallet Setup](#wallet-setup)
3. [Local Development (Full Walkthrough)](#local-development-full-walkthrough)
4. [Deploy Contracts to Base Sepolia Testnet](#deploy-contracts-to-base-sepolia-testnet)
5. [Deploy UI to Production](#deploy-ui-to-production)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Pages & What They Do](#pages--what-they-do)
8. [User Workflows](#user-workflows)
9. [Transaction Feedback](#transaction-feedback)
10. [Known Limitations](#known-limitations)
11. [Contract Address Resolution](#contract-address-resolution)
12. [Project Structure](#project-structure)

---

## Prerequisites

Install these before anything else:

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ (20 LTS recommended) | https://nodejs.org |
| Git | any | https://git-scm.com |
| MetaMask | latest | https://metamask.io (browser extension) |

Verify:

```bash
node --version   # should print v18.x or v20.x
npm --version    # should print 9.x or 10.x
git --version
```

---

## Wallet Setup

You need a browser wallet (MetaMask) to interact with the protocol. There are two scenarios: local dev with test accounts, and testnet with a real wallet.

### Option A: Local Dev Wallet (Hardhat Test Accounts)

When you run `npx hardhat node`, it prints 20 pre-funded test accounts with private keys. You will import one of these into MetaMask.

**Step 1 — Install MetaMask** in Chrome/Firefox/Brave from https://metamask.io

**Step 2 — Create or unlock MetaMask** (follow the on-screen setup if first time)

**Step 3 — Add the Localhost network to MetaMask:**
1. Click the network dropdown (top-left, says "Ethereum Mainnet")
2. Click **Add network** → **Add a network manually**
3. Fill in:

| Field | Value |
|-------|-------|
| Network name | `Localhost 8545` |
| New RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |

4. Click **Save**, then select "Localhost 8545" as your active network

**Step 4 — Import a Hardhat test account:**
1. In MetaMask, click the account icon (top-right) → **Import account**
2. Paste the private key for Account #0 from the `npx hardhat node` output
   - Example: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This is the default Hardhat Account #0 — it has 10,000 ETH and is the deployer with all protocol roles
3. Click **Import**

> **WARNING**: These keys are public and well-known. NEVER send real funds to these addresses. They are for local development only.

### Option B: Testnet Wallet (Base Sepolia)

For testnet deployment, you need a wallet with Base Sepolia ETH for gas.

**Step 1 — Create a fresh wallet in MetaMask** (or use an existing one you don't mind using on testnet)

**Step 2 — Add Base Sepolia network:**

| Field | Value |
|-------|-------|
| Network name | `Base Sepolia` |
| New RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.basescan.org` |

**Step 3 — Get testnet ETH:**

You need Base Sepolia ETH to pay for gas. Free faucets:

| Faucet | URL | Notes |
|--------|-----|-------|
| Alchemy | https://www.alchemy.com/faucets/base-sepolia | Requires free Alchemy account |
| Chainlink | https://faucets.chain.link/base-sepolia | Requires GitHub login |
| Superchain | https://app.optimism.io/faucet | Requires Optimism account |

You need ~0.01 ETH for a full deployment (12 contracts + role grants + seeding = ~30 transactions).

**Step 4 — Export your private key** (needed for contract deployment):
1. In MetaMask, click the three dots next to your account → **Account details**
2. Click **Show private key**, enter your password
3. Copy the key — you'll paste it into `.env` (see deployment section below)

> **SECURITY**: Never commit your private key. The `.env` file is gitignored. Never use a wallet that holds real funds for testnet work.

---

## Local Development (Full Walkthrough)

This runs everything on your machine — no real blockchain, no real money, instant transactions.

### Step 1 — Clone and install dependencies

```bash
git clone <your-repo-url> nexus-protocol
cd nexus-protocol
npm install
cd frontend
npm install
cd ..
```

### Step 2 — Start the local blockchain

Open a terminal (keep it running the entire time):

```bash
npx hardhat node
```

You'll see output like:

```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
  Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
  Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
...
```

**Leave this terminal open.** This is your local blockchain.

### Step 3 — Deploy contracts

Open a **second terminal**:

```bash
# Deploy all 12 contracts + grant roles + write addresses to frontend
npx hardhat run scripts/deploy.ts --network localhost
```

You should see a deployment summary listing all contract addresses. The script automatically writes `frontend/src/lib/contracts/deployments.json`.

### Step 4 — Seed test data

Still in the second terminal:

```bash
# Mint 1M NUSD, post NAV ($1M + $1.0M yield entry), post reserves, KYC the deployer
npx hardhat run scripts/seed.ts --network localhost
```

This gives you:
- 1,000,000 NUSD in the deployer wallet
- NAV oracle with 2 entries ($1M initial, $1,000,123 with yield)
- Reserve composition: $800k T-Bill-3M, $150k USDC, $50k Cash
- Deployer address KYC-verified (1-year expiry)
- Audit log entry

### Step 5 — Start the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

### Step 6 — Connect MetaMask

1. Make sure MetaMask is on the "Localhost 8545" network (see Wallet Setup above)
2. Import Account #0's private key if you haven't already
3. Click `[ CONNECT WALLET ]` in the top-right of the app
4. Approve the MetaMask connection

You should now see:
- Landing page: TVL ~$1M, NUSD Supply ~$1M, 1 Active Vault
- Portfolio: 1,000,000 NUSD balance
- Admin: Reserve ratio ~100%, Oracle updated recently, Status ACTIVE

### Step 7 — Test a deposit

1. Go to `/vaults` → click the Nexus Treasury Vault
2. In the Deposit tab, enter `1000` (1,000 NUSD)
3. Click **APPROVE & DEPOSIT**
4. Confirm both MetaMask popups (approve + deposit)
5. Your position should show ~1,000 shares

### Resetting local state

If you need to start fresh:

1. Stop the `npx hardhat node` terminal (Ctrl+C)
2. Restart it: `npx hardhat node`
3. Re-deploy: `npx hardhat run scripts/deploy.ts --network localhost`
4. Re-seed: `npx hardhat run scripts/seed.ts --network localhost`
5. In MetaMask: Settings → Advanced → **Clear activity tab data** (resets nonce)

---

## Deploy Contracts to Base Sepolia Testnet

### Step 1 — Set up environment variables

From the repo root:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Your deployer wallet private key (WITHOUT the 0x prefix)
DEPLOYER_PRIVATE_KEY=abc123def456...your_64_char_hex_key

# RPC URL (default is fine, or use Alchemy/Infura for reliability)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Optional: for contract verification on BaseScan
BASESCAN_API_KEY=your_basescan_api_key
```

> **Get a BaseScan API key** (optional but recommended): Sign up at https://basescan.org, go to API Keys, create one. This lets you verify contracts so their source code is publicly readable.

### Step 2 — Fund your deployer wallet

Make sure the wallet matching your `DEPLOYER_PRIVATE_KEY` has at least 0.01 Base Sepolia ETH. See the faucets listed in Wallet Setup above.

Check your balance:

```bash
cast balance <your-address> --rpc-url https://sepolia.base.org
```

(Or just check in MetaMask on the Base Sepolia network.)

### Step 3 — Deploy

```bash
npm run deploy:base-sepolia
```

This runs `npx hardhat run scripts/deploy.ts --network baseSepolia`. It deploys all 12 contracts, grants roles, and writes addresses to `frontend/src/lib/contracts/deployments.json`.

The deployment takes 2-5 minutes (each transaction needs block confirmation).

### Step 4 — Update frontend addresses

The deploy script writes `deployments.json` automatically, but the frontend also needs the chain config. Edit `frontend/src/lib/contracts/addresses.ts` — paste the deployed addresses into the `baseSepolia` config:

```typescript
baseSepolia: {
  id: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  blockExplorer: "https://sepolia.basescan.org",
  contracts: {
    stablecoin: "0x...",        // from deployment output
    mintController: "0x...",
    yieldVault: "0x...",
    navOracle: "0x...",
    restrictionList: "0x...",
    kycRegistry: "0x...",
    accreditedInvestor: "0x...",
    transferRestrictions: "0x...",
    reserveTracker: "0x...",
    auditLog: "0x...",
    vaultFactory: "0x...",
  },
},
```

### Step 5 — Update frontend env

Edit `frontend/.env.local`:

```env
VITE_RPC_URL=https://sepolia.base.org
VITE_CHAIN=baseSepolia
```

### Step 6 — Seed testnet data (optional)

You can seed the same test data on testnet:

```bash
npx hardhat run scripts/seed.ts --network baseSepolia
```

This mints 1M NUSD, posts NAV, reserves, and KYCs the deployer — same as local but on the real testnet.

### Step 7 — Test locally against testnet

```bash
cd frontend
npm run dev
```

MetaMask should be on the Base Sepolia network. Connect your deployer wallet. Everything should work the same as local, but transactions take ~2 seconds for block confirmation.

### Step 8 — Verify contracts on BaseScan (optional)

If you set `BASESCAN_API_KEY` in `.env`, you can verify contracts so their source is publicly readable:

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

Example for RestrictionList (constructor takes admin address):

```bash
npx hardhat verify --network baseSepolia 0xYourRestrictionListAddr "0xYourDeployerAddr"
```

Repeat for each contract. Verified contracts show a green checkmark on BaseScan and let anyone read the source code.

---

## Deploy UI to Production

The frontend is a static SvelteKit app — no server-side code, no API, no database. This makes hosting very cheap (or free).

### Step 1 — Install a static adapter

The default `adapter-auto` works for some platforms, but for maximum control, install the static adapter:

```bash
cd frontend
npm install -D @sveltejs/adapter-static
```

Update `svelte.config.js`:

```javascript
import adapter from '@sveltejs/adapter-static';
import { relative, sep } from 'node:path';

const config = {
  compilerOptions: {
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      const isExternalLibrary = pathSegments.includes('node_modules');
      return isExternalLibrary ? undefined : true;
    }
  },
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',   // SPA fallback for client-side routing
      precompress: false,
      strict: true,
    })
  }
};

export default config;
```

Add a prerender config — create `frontend/src/routes/+layout.ts` if it doesn't exist:

```typescript
export const prerender = false;
export const ssr = false;
```

### Step 2 — Set production env vars

Create `frontend/.env.production`:

```env
VITE_RPC_URL=https://sepolia.base.org
VITE_CHAIN=baseSepolia
```

(Or use Base Mainnet values when you're ready for production.)

### Step 3 — Build

```bash
cd frontend
npm run build
```

This outputs a static site to `frontend/build/`. The entire app is HTML + JS + CSS — no server needed.

### Step 4 — Deploy to a host

#### Option 1: Vercel (Free tier — recommended)

Easiest option. Free for personal projects, handles SvelteKit natively.

1. Push your repo to GitHub
2. Go to https://vercel.com → **New Project** → Import your repo
3. Set:
   - **Framework**: SvelteKit (auto-detected)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`
4. Add environment variables:
   - `VITE_RPC_URL` = `https://sepolia.base.org`
   - `VITE_CHAIN` = `baseSepolia`
5. Click **Deploy**

With Vercel, you can keep `adapter-auto` instead of `adapter-static` — it auto-detects the Vercel adapter.

| | Details |
|--|--------|
| Cost | Free (Hobby tier) |
| Custom domain | Free (bring your own) |
| SSL | Automatic |
| CDN | Global edge network |
| Limits | 100 GB bandwidth/month, 6000 build minutes/month |

#### Option 2: Cloudflare Pages (Free tier)

Very fast, generous free tier, good for static sites.

1. Push your repo to GitHub
2. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → Connect GitHub
3. Set:
   - **Build command**: `cd frontend && npm install && npm run build`
   - **Build output directory**: `frontend/build`
4. Add environment variables (`VITE_RPC_URL`, `VITE_CHAIN`)
5. Deploy

| | Details |
|--|--------|
| Cost | Free |
| Custom domain | Free |
| SSL | Automatic |
| CDN | Cloudflare global network (very fast) |
| Limits | 500 builds/month, unlimited bandwidth |

#### Option 3: Netlify (Free tier)

Similar to Vercel, slightly less SvelteKit-native.

1. Push to GitHub
2. https://app.netlify.com → **Add new site** → Import from Git
3. Set:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/build`
4. Add env vars
5. Add a `frontend/netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This handles SPA client-side routing.

| | Details |
|--|--------|
| Cost | Free (Starter tier) |
| Custom domain | Free |
| SSL | Automatic |
| Limits | 100 GB bandwidth/month, 300 build minutes/month |

#### Option 4: GitHub Pages (Free, cheapest possible)

Completely free, no account needed beyond GitHub.

1. Install the static adapter (Step 1 above)
2. Build: `cd frontend && npm run build`
3. Push the `build/` folder to a `gh-pages` branch:

```bash
cd frontend
npx gh-pages -d build
```

Or set up a GitHub Action:

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd frontend && npm ci && npm run build
        env:
          VITE_RPC_URL: https://sepolia.base.org
          VITE_CHAIN: baseSepolia
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: frontend/build
```

4. In repo Settings → Pages → Source: **Deploy from a branch** → `gh-pages` / `/ (root)`

| | Details |
|--|--------|
| Cost | Free |
| Custom domain | Free (CNAME) |
| SSL | Automatic |
| Limits | 100 GB bandwidth/month, 10 builds/day soft limit |
| Caveat | Public repos only on free tier |

### Hosting Cost Summary

| Host | Monthly Cost | Best For |
|------|-------------|----------|
| Vercel (Hobby) | $0 | Easiest SvelteKit deploy, great DX |
| Cloudflare Pages | $0 | Fastest CDN, most generous limits |
| Netlify (Starter) | $0 | Good all-rounder |
| GitHub Pages | $0 | Already on GitHub, zero config |
| AWS S3 + CloudFront | ~$1-3 | Full AWS control, enterprise |
| DigitalOcean App Platform | $0 (static) | Simple, 3 free static sites |

> **Recommendation**: Use **Vercel** for the fastest setup or **Cloudflare Pages** for the best performance. Both are free and take under 5 minutes.

---

## Environment Variables Reference

### Repo root `.env` (for contract deployment)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Yes (testnet/mainnet) | — | Wallet private key without `0x` prefix |
| `BASE_SEPOLIA_RPC_URL` | No | `https://sepolia.base.org` | Base Sepolia RPC endpoint |
| `BASE_MAINNET_RPC_URL` | No | `https://mainnet.base.org` | Base Mainnet RPC endpoint |
| `ETHEREUM_MAINNET_RPC_URL` | No | `https://eth.llamarpc.com` | Ethereum Mainnet RPC endpoint |
| `BASESCAN_API_KEY` | No | — | For contract verification on BaseScan |
| `ETHERSCAN_API_KEY` | No | — | For contract verification on Etherscan |

### Frontend `.env.local` (for UI)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_RPC_URL` | Yes | `http://127.0.0.1:8545` | RPC endpoint the UI connects to |
| `VITE_CHAIN` | Yes | `localhost` | Chain key: `localhost` or `baseSepolia` |

---

## Pages & What They Do

### Public (no wallet needed to read)

| Route | Purpose |
|-------|---------|
| `/` | Protocol overview — TVL, NUSD supply, vault preview cards |
| `/vaults` | All vaults from factory — share price, TVL, your position |
| `/vaults/[address]` | Vault detail — deposit NUSD, withdraw, live previews |
| `/portfolio` | Your positions across all vaults + NUSD balance |

### Admin (connect with a privileged wallet)

| Route | Roles needed | Purpose |
|-------|-------------|---------|
| `/admin` | any | System health — reserve ratio, oracle age, pause status |
| `/admin/mint` | MINT_CONTROLLER or ALLOCATOR_ROLE | Mint/burn NUSD, set allocations |
| `/admin/compliance` | RESTRICTOR_ROLE / VERIFIER_ROLE | Denylist, KYC, accreditation |
| `/admin/oracle` | REPORTER_ROLE | Post NAV updates, view 30-entry history |
| `/admin/reserves` | REPORTER_ROLE | Post reserve composition, view history + ratio |

> Role enforcement is on-chain only. The UI does not hide admin forms from unprivileged wallets — transactions will revert with a role error if the connected wallet lacks the required role.

---

## User Workflows

### Investor: Deposit into a Vault

1. Ensure your address is KYC'd (admin must call `KYCRegistry.setVerified`)
2. Navigate to `/vaults` → click a vault row
3. Enter amount in the Deposit tab — "AVAILABLE: X NUSD" shows your balance in green
4. Click **APPROVE & DEPOSIT** — two MetaMask confirmations:
   - Tx 1: `NUSD.approve(vaultAddress, amount)`
   - Tx 2: `YieldVault.deposit(amount, yourAddress)`
5. Shares appear in Your Position. Check `/portfolio` for full view.

### Investor: Withdraw from a Vault

1. Navigate to `/vaults/[address]` → Withdraw tab
2. Enter NUSD amount to withdraw
3. Preview shows shares that will be burned
4. Click **WITHDRAW** — `YieldVault.withdraw(amount, you, you)`
5. NUSD returns to wallet including accrued yield

### Operator: Mint NUSD

1. Admin sets allocation on `/admin/mint` → Set Allocation card
2. Minter connects wallet, enters recipient + amount → **MINT**
3. `MintController.mint(to, amount)` enforces ceiling

### Operator: Post NAV

1. Navigate to `/admin/oracle`
2. Enter new total assets (NUSD, e.g. `1050000.00` for $1.05M)
3. Click **POST NAV** — timestamp auto-set to now
4. Share price updates across all vault pages

### Compliance Officer: Denylist

- **Check**: enter any address → CHECK (read-only, no gas)
- **Single restrict/unrestrict**: enter address → RESTRICT or UNRESTRICT
- **Batch restrict**: paste addresses one-per-line → BATCH RESTRICT

### Compliance Officer: KYC

- Enter address + expiry date → **VERIFY** (`KYCRegistry.setVerified`)
- **CHECK STATUS** shows verified/expired state inline
- **REVOKE** removes verification immediately

### Compliance Officer: Accreditation

- Enter address → **CHECK** status, then **SET ACCREDITED** or **REVOKE**

### Operator: Post Reserves

1. Navigate to `/admin/reserves`
2. Select asset type (T-Bill-3M, T-Bill-6M, USDC, Cash)
3. Enter amount → **POST RESERVE**
4. Composition panel shows latest per asset type
5. Reserve Ratio stat updates — target >= 100%

---

## Transaction Feedback

All write operations use `TxButton` which:
- Shows a blinking cursor (`▋`) + `CONFIRMING...` during pending state
- Green toast on confirmation
- Red toast with message on revert or user rejection
- Resets automatically

---

## Known Limitations

| Feature | Status | Notes |
|---------|--------|-------|
| APY / yield history | Not shown | Requires event indexer (The Graph / Ponder) |
| Transaction history | Not shown | Requires event indexer |
| KYC user count | Shows "—" | Requires indexer |
| Share price chart | Placeholder | Chart.js integration is separate work |
| Role gating in UI | None | Txs revert on-chain if wrong role |
| Pause / Unpause button | Not built | Call directly or add to `/admin` page |
| Vault creation UI | Not built | Use `YieldVaultFactory.createVault` directly |
| Batch KYC | Not built | Use `batchSetVerified` directly |

---

## Contract Address Resolution

- **localhost** (default): reads `src/lib/contracts/deployments.json` (auto-written by deploy script)
- **baseSepolia**: fill in `CHAINS.baseSepolia.contracts` in `src/lib/contracts/addresses.ts`

Active chain controlled by `VITE_CHAIN` env var.

---

## Project Structure

```
nexus-protocol/
├── contracts/                          # Solidity contracts
├── scripts/
│   ├── deploy.ts                       # Deploy all 12 contracts + grant roles
│   └── seed.ts                         # Seed test data (1M NUSD, NAV, reserves)
├── .env.example                        # Template for deployment env vars
├── hardhat.config.ts                   # Network configs (localhost, baseSepolia, etc.)
├── package.json                        # Root: compile, test, deploy:local, deploy:base-sepolia
└── frontend/
    ├── src/
    │   ├── lib/
    │   │   ├── contracts/
    │   │   │   ├── abis.ts             # Minimal ABIs for all 9 contracts
    │   │   │   ├── addresses.ts        # Chain configs + address resolution
    │   │   │   ├── deployments.json    # Written by deploy script (gitignored)
    │   │   │   └── index.ts            # getContract() helpers
    │   │   ├── stores/
    │   │   │   ├── wallet.ts           # address, walletClient, publicClient, connect/disconnect
    │   │   │   └── toast.ts            # Toast notification store
    │   │   └── components/
    │   │       ├── WalletButton.svelte
    │   │       ├── StatCard.svelte
    │   │       ├── Toast.svelte
    │   │       └── TxButton.svelte
    │   └── routes/
    │       ├── +layout.svelte
    │       ├── +page.svelte                        # Landing
    │       ├── vaults/+page.svelte                 # Vault list
    │       ├── vaults/[address]/+page.svelte       # Vault detail + deposit/withdraw
    │       ├── portfolio/+page.svelte              # User portfolio
    │       └── admin/
    │           ├── +page.svelte                    # System health dashboard
    │           ├── mint/+page.svelte               # Mint / burn / allocations
    │           ├── compliance/+page.svelte         # Denylist / KYC / accreditation
    │           ├── oracle/+page.svelte             # NAV history + post NAV
    │           └── reserves/+page.svelte           # Reserve composition + ratio
    ├── .env.local                                  # VITE_RPC_URL + VITE_CHAIN
    ├── svelte.config.js                            # Adapter config
    └── package.json                                # Frontend: dev, build, preview
```
