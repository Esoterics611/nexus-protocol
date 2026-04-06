# Nexus Protocol — Claude Code Project Guide

## What This Is
Institutional digital asset protocol suite: tokenized treasuries (ERC-4626), stablecoin (UUPS upgradeable), derivatives, and compliance layer. Fully independent protocol — NOT integrated with Vanguard DAO or any other project.

## Quick Commands
```bash
npx hardhat compile          # Compile all contracts
npx hardhat test             # Run all tests
npx hardhat coverage         # Coverage report
npx hardhat run scripts/deploy.ts  # Deploy to local node
```

## Tech Stack
- **Solidity 0.8.28** — Cancun EVM target
- **Hardhat v3** — ESM project (`"type": "module"` in package.json)
- **OpenZeppelin v5.6.1** — Contracts + Contracts-Upgradeable
- **Viem** — Used by hardhat-toolbox-viem (NOT ethers.js)
- **TypeScript** — All scripts and tests

## Key Architecture Decisions
1. **ERC-4626** for all vault products (non-negotiable — composability standard)
2. **UUPS proxy** for stablecoin upgradeability (not transparent proxy)
3. **Cancun EVM** required (OZ v5.6 uses `mcopy` opcode)
4. **6 decimals** on stablecoin (USDC convention)
5. **AccessControl** pattern throughout (not Ownable)
6. **Adapter pattern** for all institutional integrations (mock for dev, real for prod)

## Contract Layout
```
contracts/
├── vaults/           # ERC-4626 yield vaults + NAV oracle
├── stablecoin/       # UUPS stablecoin + mint controller + denylist
├── compliance/       # Transfer restrictions, KYC, accredited investor
├── accounting/       # Reserve tracking, audit log
└── governance/       # OZ Governor + Timelock (TODO)
```

## Important Patterns
- **NAV Oracle**: Trusted reporter posts daily NAV → YieldVault uses it for `totalAssets()`
- **RestrictionList**: Shared denylist used by both stablecoin and vault transfers
- **MintController**: Two-tier allocation — admin sets ceiling per minter, minters mint within ceiling
- **TransferRestrictions**: Modular checks (denylist + KYC) pluggable into any token

## OpenZeppelin Import Casing
OZ v5 uses capitalized directory names for token standards:
```solidity
// CORRECT
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

// WRONG (will fail)
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/erc20/ERC20Upgradeable.sol";
```

## Chain Deployment Order
1. Base Sepolia (development/testing)
2. Base Mainnet (initial launch)
3. Ethereum Mainnet (institutional credibility)
4. Arbitrum (DeFi composability)

## Base Sepolia Deployment — RPC + Gas Notes

Hard-won learnings from multi-session deploys to Base Sepolia (Chain ID 84532):

### RPC Selection
- **`https://base-sepolia.drpc.org`** — works for small contracts (<~4KB bytecode), but returns HTTP 403 for larger ones (CreditVault, YieldVaultFactory, NexusStableCoin). Use for cheap write calls.
- **`https://base-sepolia-rpc.publicnode.com`** — works for ALL contract sizes. Use this for large contract deploys (CreditVault, ETFWrapper, YieldSplitter, NexusStableCoin).
- **`https://sepolia.base.org`** (official Coinbase) — returns "unknown RPC error" for deploy txs with pre-computed gas. Avoid.

### Nonce Issues
- drpc and publicnode don't consistently serve the same pending nonce. After many retried failed deploys, the wallet nonce can drift. Always check `eth_getTransactionCount("latest")` before re-running a deploy.
- Hardhat v3 viem client sometimes re-uses a nonce if the RPC nonce returned is stale. Solution: wait until `confirmed == pending` before re-running.

### Gas Limits (always required — drpc pre-simulation fails without them)
| Contract | Gas |
|---|---|
| Small contracts (RestrictionList, KYCRegistry, etc.) | `1000000n` |
| NexusStableCoin impl | `3000000n` |
| ERC1967Proxy (UUPS init) | `1000000n` |
| YieldVault, PrincipalToken, YieldToken | `2000000n` |
| YieldSplitter, CreditVault, ETFWrapper | `2000000n` |
| YieldVaultFactory | `5000000n` (but deploy YieldVault directly instead — factory inner-deploy fails on drpc) |
| createVault() | `5000000n` (inner YieldVault deploy) |

### Deployment Strategy
- **Phase 1** (core protocol) — use `scripts/deploy.ts` with drpc (small contracts all work)
- **Phase 2** (derivatives) — use `scripts/deployDerivatives.ts` + `scripts/deployDerivsPhase2.ts`
  - PT, YT, YieldSplitter → drpc works
  - CreditVault, ETFWrapper → **use publicnode**
- YieldSplitter nonce prediction: capture nonce BEFORE PT deploy → splitter = `nonce + 2n`
- Never deploy YieldVaultFactory via createVault on drpc — deploy YieldVault directly

### Current Testnet State
See `docs/CONTRACT_REGISTRY.md` and `docs/PHASE_TRACKER.md` for all live addresses.

## Future Stack (Not Yet Built)
- **Backend**: NestJS microservices
- **Frontend**: SvelteKit
- **Indexing**: The Graph or Ponder
- **Database**: PostgreSQL
- **Cache**: Redis
- **Monitoring**: Prometheus + Grafana

## Documentation
- `docs/BUILD_PROMPT.md` — Full original build requirements
- `docs/PHASE_TRACKER.md` — Phase progress tracking
- `docs/ARCHITECTURE.md` — System architecture and contract relationships
- `docs/DECISIONS.md` — Architecture Decision Records (9 ADRs)
- `docs/INTEGRATION_ROADMAP.md` — 9 integration points with partner research + next steps
- `docs/CONTRACT_REGISTRY.md` — All contracts with addresses, roles, wiring order
- `docs/E2E_WORKFLOWS.md` — 7 end-to-end workflows with exact contract calls
- `docs/UI_PLAN.md` — SvelteKit UI architecture, 8 screen specs, implementation plan
