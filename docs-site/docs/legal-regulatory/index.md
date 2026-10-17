# Legal & Regulatory Overview

This section is for legal counsel, compliance officers, and regulators evaluating Nexus Protocol. It covers token classification, smart contract risk profile, reserve transparency mechanisms, and the governance framework.

---

## Regulatory Posture

Nexus Protocol is designed for institutional compliance from the ground up:

- **Access-controlled:** Every operation requires role-based authorization
- **KYC-gated:** Vault access requires on-chain identity verification with time-bounded expiry
- **Sanctions-screened:** A global denylist blocks restricted addresses across all tokens
- **Auditable:** Immutable on-chain audit trail and reserve composition tracking
- **Upgradeable where needed:** The stablecoin can be updated to meet new regulatory requirements

---

## Key Regulatory Considerations

| Area | Current State | Notes |
|------|--------------|-------|
| Legal entity | Not yet formed | Delaware LLC or C-Corp recommended |
| Money transmitter license | Not obtained | Required in most US states for stablecoin issuance |
| Securities classification | Under review | Depends on token type and jurisdiction |
| GENIUS Act | Monitoring | Pending federal stablecoin legislation |
| Reserve attestation | Self-reported | Independent auditor planned for production |
| AML/BSA program | In development | Formal program required before launch |

---

## Quick Links

| Topic | What You'll Find |
|-------|-----------------|
| [Token Classification](token-classification.md) | How each token may be classified, per-jurisdiction considerations |
| [Smart Contract Risks](smart-contract-risks.md) | Upgrade mechanism, admin keys, oracle trust, known limitations |
| [Reserve Transparency](reserve-transparency.md) | How reserves are tracked, proof-of-reserves workflow |
| [Governance](governance.md) | Governor + Timelock design, proposal lifecycle, upgrade authorization |
