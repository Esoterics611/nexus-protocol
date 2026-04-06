# Nexus Protocol — Architecture Decision Records

## ADR-001: ERC-4626 for Vault Standard
**Status:** Accepted
**Date:** 2026-04-02

**Context:** Fidelity's FDIT uses a custom ERC-20. We need a vault standard for tokenized treasuries.

**Decision:** Use ERC-4626 (Tokenized Vault Standard) for all vault products.

**Why:**
- Industry-standard deposit/withdraw/mint/redeem interface
- Native composability with every DeFi protocol supporting 4626
- Share price = totalAssets / totalSupply gives automatic NAV
- Yield accrual built into share price appreciation
- Pendle, Yearn, Balancer, Aave all integrate with 4626

**Consequences:** Cannot use rebasing token model (which some protocols prefer for UX simplicity).

---

## ADR-002: UUPS Proxy over Transparent Proxy
**Status:** Accepted
**Date:** 2026-04-02

**Context:** The stablecoin needs upgradeability for regulatory changes and bug fixes.

**Decision:** Use UUPS (Universal Upgradeable Proxy Standard) instead of ERC-1967 Transparent Proxy.

**Why:**
- Cheaper deployment (upgrade logic lives in implementation, not proxy)
- Cleaner upgrade pattern — `_authorizeUpgrade()` in implementation
- Gas savings on every call (no admin slot check per tx)
- FIDD used transparent proxy — we improve on this
- OZ v5 recommends UUPS

**Consequences:** If implementation is deployed without upgrade function, proxy is permanently locked. Mitigated by OZ's UUPSUpgradeable base contract.

---

## ADR-003: Cancun EVM Target
**Status:** Accepted
**Date:** 2026-04-02

**Context:** OpenZeppelin v5.6.1 uses `mcopy` opcode (Cancun) in `Bytes.sol` and `Memory.sol`.

**Decision:** Target Cancun EVM in Hardhat config.

**Why:** Required by OZ v5.6.x. Base supports Cancun. No compatibility issue for target chains.

---

## ADR-004: Bool-returning ITransferRestrictions
**Status:** Accepted
**Date:** 2026-04-03

**Context:** Two patterns for transfer restriction checks — revert-on-failure vs return-bool.

**Decision:** Use `isTransferAllowed(from, to, amount) → bool` interface.

**Why:**
- Simpler for vault integration — vault controls the revert message
- Allows composing multiple restriction modules without try/catch
- Gas-efficient — no string encoding for revert reasons in restriction module

**Consequences:** Callers must check return value and revert themselves. The vault does this in `_update()`.

---

## ADR-005: Shared RestrictionList
**Status:** Accepted
**Date:** 2026-04-02

**Context:** Both stablecoin and vault need denylist functionality.

**Decision:** Single RestrictionList contract shared across all tokens.

**Why:**
- OFAC/sanctions list is global — same addresses blocked everywhere
- Single point of update for compliance team
- Reduces gas (one contract, not N)
- Stablecoin checks it directly in `_update()`; vault checks it via TransferRestrictions

---

## ADR-006: 6 Decimals for Stablecoin
**Status:** Accepted
**Date:** 2026-04-02

**Context:** ERC-20 default is 18 decimals. USDC uses 6.

**Decision:** NexusStableCoin uses 6 decimals.

**Why:** Matches USDC convention. Institutional users expect dollar-denominated tokens to have 6 decimals. Simplifies accounting (1 NUSD = 1_000_000 base units, not 1e18).

---

## ADR-007: Hardhat v3 with Viem (not Ethers.js)
**Status:** Accepted
**Date:** 2026-04-02

**Context:** Hardhat v3 ships with viem-based toolbox as default.

**Decision:** Use `@nomicfoundation/hardhat-toolbox-viem` (v5) with Hardhat v3.

**Why:** Hardhat v3 is ESM-native, viem is the modern standard. Ethers.js toolbox is deprecated in v3 context. Tests and scripts use viem patterns.

---

## ADR-008: Independent Protocol (No Vanguard DAO)
**Status:** Accepted
**Date:** 2026-04-02

**Context:** Original spec suggested governing via a Vanguard DAO instance.

**Decision:** Nexus Protocol is fully independent. Own governance via OpenZeppelin Governor + Timelock. No integration with Vanguard DAO.

**Why:** Clean separation of concerns. Each protocol should be self-contained with its own governance. Avoids cross-project coupling.

---

## ADR-009: Adapter Pattern for Institutional Integrations
**Status:** Accepted
**Date:** 2026-04-02

**Context:** Protocol needs to interface with banks, custodians, KYC providers, etc.

**Decision:** Every institutional integration uses an adapter interface with mock and real implementations.

**Why:**
- Develop and test without real institutional relationships
- Same codebase, swap adapters for production
- Clean boundary between protocol logic and external integrations
- Each adapter can be independently developed and tested

**Adapter interfaces planned:**
- `IBankAdapter` — deposit/withdrawal wires
- `ICustodianAdapter` — asset custody verification
- `IKYCProviderAdapter` — identity verification (Jumio, Onfido)
- `ISanctionsAdapter` — OFAC/sanctions screening (Chainalysis, Elliptic)
- `INAVFeedAdapter` — fund administrator NAV feed
- `ITreasuryDealerAdapter` — T-bill buy/sell
- `IFiatRampAdapter` — fiat on/off ramp
