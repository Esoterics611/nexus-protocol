# Client Pitches

Talking points organized by client type. Tailor your pitch to the client's mandate, risk tolerance, and regulatory constraints.

---

## Pension Fund

**Their mandate:** Stable, predictable returns to meet long-dated liabilities. Capital preservation is paramount. Regulated, conservative allocation guidelines.

**Lead with:** Treasury Vault and Principal Tokens.

**Key talking points:**

- "The Treasury Vault delivers T-bill-equivalent yield (~4.5% APY) with daily NAV transparency and on-chain audit trail — the same underlying assets your fixed income desk already buys, but with 24/7 settlement."
- "Principal Tokens let you lock in a fixed rate to maturity. Buy PT at $0.957 today, redeem at $1.00 in 12 months — exactly 4.5% annualized, no rate risk."
- "Every transfer is gated by KYC verification and sanctions screening. The on-chain compliance layer matches your regulatory requirements."
- "Reserve composition is posted daily via the ReserveTracker contract — your auditors can verify backing in real time, not quarterly."

**Recommended products:**

| Product | Allocation | Rationale |
|---------|-----------|-----------|
| Treasury Vault | 60% | Core yield, daily liquidity |
| Principal Token | 30% | Fixed-rate liability matching |
| Senior Tranche *(Planned)* | 10% | Capital-protected enhanced yield |

---

## Family Office

**Their mandate:** Wealth preservation with moderate growth. More flexibility than institutional mandates. May have higher risk tolerance for a portion of portfolio.

**Lead with:** Treasury Vault, ETF Wrapper, and Credit Vault.

**Key talking points:**

- "The ETF Wrapper gives you diversified exposure across our vault ecosystem in a single token — one position, multiple yield sources."
- "Use the Credit Vault to borrow against your vault position without selling. Access liquidity while your T-bill exposure continues earning."
- "For the yield-seeking sleeve: Yield Tokens let you speculate on rate moves. If you're bullish on rates, YT captures the upside."

**Recommended products:**

| Product | Allocation | Rationale |
|---------|-----------|-----------|
| ETF Wrapper | 50% | Diversified, passive |
| Treasury Vault | 25% | Direct yield, full control |
| Credit Vault | 15% | Leverage without liquidating position |
| Yield Token | 10% | Rate speculation (bullish on rates) |

---

## Corporate Treasury

**Their mandate:** Park excess cash safely, earn above money market rates, maintain daily liquidity for operational needs.

**Lead with:** NUSD Stablecoin and Treasury Vault.

**Key talking points:**

- "NUSD replaces your bank sweep account — same dollar peg, but earnable yield in the Treasury Vault at T-bill rates instead of the 0.5% your bank offers."
- "Deposit and withdraw daily. No lockup periods, no redemption gates. Your operational cash stays liquid."
- "Mint NUSD against your USD wire, deposit into the vault, and earn yield — all before your current bank processes a T-bill purchase order."
- "Full audit trail on-chain. Your CFO can verify every transaction via the AuditLog contract."

**Recommended products:**

| Product | Allocation | Rationale |
|---------|-----------|-----------|
| NUSD (liquid) | 30% | Operational cash, instant access |
| Treasury Vault | 70% | Yield on excess cash |

---

## Insurance Company

**Their mandate:** Match liabilities with high-quality fixed-income assets. Regulatory capital constraints. Need predictable cash flows.

**Lead with:** Principal Tokens and Senior Tranches.

**Key talking points:**

- "PT gives you a zero-coupon instrument with a known payout at maturity — ideal for liability matching."
- "The Senior Tranche offers capital protection with a guaranteed yield floor. Junior depositors absorb losses before your position is affected."
- "All positions are KYC-gated and sanctions-screened. The AccessControl architecture provides full auditability for your regulators."

**Recommended products:**

| Product | Allocation | Rationale |
|---------|-----------|-----------|
| Principal Token | 50% | Fixed-rate liability matching |
| Senior Tranche *(Planned)* | 30% | Capital-protected yield |
| Treasury Vault | 20% | Floating-rate allocation |

---

## Hedge Fund

**Their mandate:** Absolute returns. Willing to use leverage and derivatives. Sophisticated risk management. Care about execution and composability.

**Lead with:** Yield Tokens, Credit Vault, and Junior Tranches.

**Key talking points:**

- "Yield Tokens are a pure rate play. If you have a view that the Fed holds or raises, YT captures the upside. Think of it as the floating leg of an interest rate swap."
- "The Credit Vault is an on-chain repo facility — borrow NUSD at 5% against vault shares and deploy the capital elsewhere. 150% collateral ratio, continuous liquidation protection."
- "Junior Tranches amplify yield: in an 80/20 senior/junior split with 5% vault yield and 3% senior cap, junior earns ~13% on invested capital."
- "All contracts are ERC-4626 and ERC-20 — composable with the rest of DeFi. Build strategies on top."

**Recommended products:**

| Product | Allocation | Rationale |
|---------|-----------|-----------|
| Credit Vault | 40% | Leveraged yield, repo-like |
| Yield Token | 30% | Rate speculation |
| Junior Tranche *(Planned)* | 20% | Enhanced yield, first-loss |
| Treasury Vault | 10% | Base collateral |

---

## Common Objections & Responses

| Objection | Response |
|-----------|---------|
| "Smart contracts are risky" | All contracts use audited OpenZeppelin v5 libraries. The stablecoin is UUPS-upgradeable for bug fixes. Non-upgradeable contracts can be replaced by deploying new versions. |
| "What if the oracle is wrong?" | The NAV oracle uses an authorized reporter pattern — only trusted addresses can post. Multi-sig control is recommended for production. Invalid values (zero, decreasing timestamps) are rejected by the contract. |
| "How do we know reserves are real?" | ReserveTracker posts daily composition on-chain. Independent auditor attestation is planned for production (Armanino or Withum). |
| "Is this a security?" | Token classification depends on jurisdiction and structure. See the [Legal & Regulatory](../legal-regulatory/token-classification.md) section. We recommend clients consult their own legal counsel. |
| "What about liquidation risk?" | Credit Vault uses conservative parameters: 150% collateral ratio, 120% liquidation threshold. Positions are monitored continuously and liquidation is permissionless for rapid resolution. |
| "Can we do this on Ethereum mainnet?" | Ethereum mainnet deployment is on the roadmap. Currently live on Base (lower gas, faster finality). The canonical stablecoin deployment will be on Ethereum for institutional credibility. |
