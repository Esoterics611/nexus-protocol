# Nexus Protocol — Full Build Requirements Prompt

## Saved: April 2, 2026
## Author: Ronnie Rendel

This file contains the complete build requirements prompt used to initialize this project.
It serves as the authoritative reference for what this protocol is and how it should be built.

---

# EXECUTIVE SUMMARY

Build an independent, open-source protocol suite that replicates and extends Fidelity's digital asset product roadmap — stablecoins, interest-bearing tokenized treasuries, and on-chain derivatives — as a demonstration platform and potential production system.

This is NOT a copy of FIDD. This is a protocol that solves the same problems with a better architecture, governed as a DAO, and designed for institutional composability from day one.

**Priority order:**
1. Interest-bearing tokenized treasury protocol (most interesting, highest value)
2. Stablecoin protocol (simpler, but needed as base layer)
3. Derivatives / structured products (complex, builds on 1+2)
4. Messaging & services architecture
5. Real-world finance integration layer

**Key decision:** This protocol is FULLY INDEPENDENT — no Vanguard DAO integration. Own governance, own repo, own contracts.

---

# CHAIN STRATEGY

**Build on Base first** (low cost, fast iteration), **deploy canonical versions to Ethereum mainnet** for institutional credibility, **bridge to Arbitrum** for DeFi composability. Design all contracts to be chain-agnostic from day one.

| Chain | Best For |
|-------|----------|
| **Base** | Development, testing, initial launch, DAO governance |
| **Ethereum Mainnet** | Stablecoin (matching FIDD), institutional credibility |
| **Arbitrum** | DeFi composability, yield products |

---

# PROTOCOL SUITE

## Protocol 1: Tokenized Treasury Vault (BUILD FIRST)

ERC-4626 tokenized vault that holds yield-bearing assets and distributes yield to depositors.
- Share price appreciation model (not rebasing)
- NAV oracle with trusted reporter
- Factory pattern for multiple vault types
- DAO governance over vault parameters

## Protocol 2: Stablecoin (Build Second)

ERC-20 + ERC-2612 (permit) + UUPS proxy + roles + mint allocation + denylist.
- Improvements over FIDD: UUPS proxy, tiered roles with timelock, on-chain reserve proof, DAO-governed mint caps, multi-chain from design

## Protocol 3: Derivatives & Structured Products (Build Third)

- Yield splitting (PT/YT decomposition)
- Tranched structured products (senior/junior)
- On-chain credit (collateralized lending against vault shares)
- ETF wrapper (multiple vault positions → single token)

---

# SERVICES ARCHITECTURE

NestJS microservices:
- API gateway (REST + WebSocket + GraphQL)
- Event indexer (The Graph or Ponder)
- Reconciliation engine
- NAV reporter / oracle service
- Compliance service (sanctions screening, KYC, denylist sync)
- Audit report generator
- Integration adapters (bank, custodian, treasury dealer, fiat ramp) — mock for dev

**Stack:** NestJS, PostgreSQL, Redis, SvelteKit frontend, Prometheus + Grafana monitoring

---

# BUILD PHASES

## Phase 1: Foundation (Weeks 1-2) ← CURRENT
Core vault + stablecoin contracts, deployed on Base Sepolia

## Phase 2: Derivatives (Weeks 3-4)
Yield splitting, structured products, credit vaults

## Phase 3: Services Layer (Weeks 5-6)
Off-chain operating platform (NestJS microservices)

## Phase 4: Frontend (Weeks 7-8)
SvelteKit investor portal + operator dashboard

## Phase 5: Production Hardening (Weeks 9-10)
Formal verification, gas optimization, mainnet deployment

## Phase 6: Institutional Integration (Ongoing)
Replace mock adapters with real institutional connections

---

# TECH DECISIONS (NON-NEGOTIABLE)

1. Solidity 0.8.28 with Hardhat v3, OpenZeppelin v5
2. ERC-4626 for all vault products
3. UUPS proxy for upgradeability
4. Base Sepolia first → Base mainnet → Ethereum mainnet
5. NestJS for all backend services
6. SvelteKit for frontend
7. The Graph or Ponder for event indexing
8. PostgreSQL for off-chain data
9. Redis for caching and pub/sub
10. Adapter pattern for all institutional integrations

---

# WHAT MAKES THIS INTERESTING

1. **Yield splitting** — PT/YT decomposition of tokenized treasuries
2. **Tranched structured products** — Securitization on-chain
3. **Composable credit** — Repo agreements on-chain
4. **DAO-governed institutional finance** — Credible decentralization path
5. **On-chain reserve proofs** — Merkle proofs, better than monthly attestation
6. **Multi-chain from day one** — Base + Ethereum + Arbitrum

---

# REFERENCES

- FIDD Contract: https://etherscan.io/token/0x7c135549504245b5eae64fc0e99fa5ebabb8e35d
- FIDD Source: https://github.com/fidelity/mintable-token-ethereum-contract
- ERC-4626 Standard: https://eips.ethereum.org/EIPS/eip-4626
- Pendle Finance (yield splitting): https://docs.pendle.finance/
- Maple Finance (on-chain credit): https://docs.maple.finance/
- Ondo Finance (tokenized treasuries): https://docs.ondo.finance/
- GENIUS Act: https://www.congress.gov/bill/119th-congress/senate-bill/1582
