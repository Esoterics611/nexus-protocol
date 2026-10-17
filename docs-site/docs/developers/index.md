# Developer Overview

Quick-start guide for developers working with or building on Nexus Protocol.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Solidity | 0.8.28 |
| Framework | Hardhat | v3 (ESM) |
| Libraries | OpenZeppelin | v5.6.1 (Contracts + Contracts-Upgradeable) |
| Client | Viem | via hardhat-toolbox-viem |
| Language | TypeScript | ES modules (`"type": "module"` in package.json) |
| EVM Target | Cancun | Required for OZ v5.6 `mcopy` opcode |

---

## Quick Commands

```bash
# Compile all contracts
npx hardhat compile

# Run all tests
npx hardhat test

# Coverage report
npx hardhat coverage

# Deploy to local node
npx hardhat run scripts/deploy.ts

# Deploy to Base Sepolia
npx hardhat run scripts/deploy.ts --network baseSepolia
```

---

## Project Structure

```
nexus-protocol/
├── contracts/
│   ├── vaults/           # ERC-4626 yield vaults + NAV oracle
│   ├── stablecoin/       # UUPS stablecoin + mint controller + denylist
│   ├── compliance/       # Transfer restrictions, KYC, accredited investor
│   ├── accounting/       # Reserve tracking, audit log
│   ├── derivatives/      # PT, YT, YieldSplitter, CreditVault, ETFWrapper
│   ├── gateway/          # ETH swap gateway + mock price feed
│   └── governance/       # Governor + Timelock (Planned)
├── scripts/              # Deploy and setup scripts
├── test/                 # Test suite (viem-based)
├── docs/                 # Internal architecture docs
└── docs-site/            # This documentation site
```

---

## Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| ERC-4626 for all vaults | Industry-standard composability with DeFi protocols |
| UUPS proxy for stablecoin only | Money contract needs upgradeability; others can be replaced |
| Bool-returning transfer restrictions | Simpler composition, vault controls the revert message |
| Shared RestrictionList | One denylist update blocks across all tokens |
| 6 decimals on stablecoin | USDC convention for institutional compatibility |
| Adapter pattern for integrations | Mock for dev, real for prod — same codebase |

See [Architecture](architecture.md) for the full system design and [Contract Reference](contracts-reference.md) for detailed specs.

---

## Quick Links

| Topic | Description |
|-------|------------|
| [Architecture](architecture.md) | System layers, contract relationships, data flows |
| [Contract Reference](contracts-reference.md) | Every contract: purpose, functions, events, roles |
| [Deployment Guide](deployment-guide.md) | Deploy scripts, wiring order, gas estimates |
| [Integration Guide](integration-guide.md) | How to integrate: deposits, events, API |
| [Testing](testing.md) | Test suite overview, patterns, running tests |
| [API Reference](api-reference.md) | REST API endpoints, WebSocket events |
