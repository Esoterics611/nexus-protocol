# Token Classification

How each Nexus Protocol token may be classified from a regulatory perspective, and considerations by jurisdiction.

!!! warning "Not Legal Advice"
    This document provides a technical description of token characteristics relevant to classification analysis. It is not legal advice. Consult qualified legal counsel for jurisdiction-specific determinations.

---

## Token Inventory

| Token | Symbol | Type | Decimals | Transferable | Upgradeable |
|-------|--------|------|:--------:|:------------:|:-----------:|
| NexusStableCoin | NUSD | ERC-20 | 6 | Yes | Yes (UUPS) |
| YieldVault share | nxTREASURY | ERC-4626 / ERC-20 | 18 | Yes | No |
| Principal Token | PT | ERC-20 | 6 | Yes | No |
| Yield Token | YT | ERC-20 | 6 | Yes | No |
| ETF Wrapper | nxETF | ERC-20 | 18 | Yes | No |
| CreditVault position | N/A | Mapping | N/A | No | No |

---

## Classification Analysis by Token

### NUSD (Stablecoin)

**Characteristics:**

- Pegged 1:1 to USD
- Backed by USD reserves at a partner bank
- Minted upon receipt of USD wire, burned upon redemption
- 6 decimal places (USDC convention)
- Transferable between non-restricted addresses

**Likely classification:** Payment stablecoin

**Relevant regulatory frameworks:**

| Jurisdiction | Framework | Notes |
|-------------|-----------|-------|
| United States | GENIUS Act (pending), state MTL requirements | Would likely be classified as a payment stablecoin; money transmitter license required in most states |
| European Union | MiCA (Markets in Crypto-Assets Regulation) | Would need to meet e-money token or asset-referenced token requirements |
| United Kingdom | FCA stablecoin framework (evolving) | Likely falls under payment regulation |
| Singapore | MAS Payment Services Act | May be classified as a digital payment token |

---

### nxTREASURY (Vault Shares)

**Characteristics:**

- Represents a share of a pooled investment vehicle
- Value appreciates based on underlying T-bill yield
- Holders share in profits proportionally
- Access gated by KYC and transfer restrictions

**Potential classification concerns:**

- Under the Howey test (US), vault shares may constitute securities if:
    - There is an investment of money
    - In a common enterprise
    - With an expectation of profits
    - Derived from the efforts of others (the NAV oracle reporter and protocol operators)
- The KYC gating and accredited investor checks are designed to support compliance with securities regulations if vault shares are classified as securities

**Relevant frameworks:**

| Jurisdiction | Consideration |
|-------------|--------------|
| United States | Potential security under Howey; may require SEC registration or exemption (Reg D, Reg S) |
| European Union | MiCA provisions for crypto-assets; may also fall under MiFID II if classified as a financial instrument |
| General | Similar to a tokenized money market fund share |

---

### Principal Token (PT)

**Characteristics:**

- Fixed-value claim redeemable at maturity for 1 NUSD per PT
- Trades at a discount before maturity (implied yield)
- Created by splitting vault shares via YieldSplitter
- Functionally similar to a zero-coupon bond

**Potential classification:** Likely a security in most jurisdictions. Functions as a zero-coupon debt instrument with a known maturity and payout.

---

### Yield Token (YT)

**Characteristics:**

- Represents a claim on all yield from underlying vault positions until maturity
- Value fluctuates based on interest rate expectations
- No guaranteed return — yield depends on vault performance
- Functionally similar to a floating-rate interest strip

**Potential classification:** Likely a security or derivative. Represents a future cash flow stream dependent on the performance of managed assets.

---

### nxETF (ETF Wrapper)

**Characteristics:**

- Basket token backed by weighted allocations across multiple vaults
- Value reflects the combined NAV of underlying vaults
- Functionally similar to a fund-of-funds or index product

**Potential classification:** Likely an investment company product or collective investment scheme. May require registration under applicable securities laws.

---

### CreditVault Positions

**Characteristics:**

- Non-transferable collateralized debt positions
- User deposits collateral, borrows NUSD
- Not a token — stored as contract state per address

**Classification consideration:** The borrowing relationship may be classified as a lending arrangement. The position itself is not a transferable security.

---

## Regulatory Mitigations Built into the Protocol

| Mitigation | Description |
|-----------|-------------|
| **KYC verification** | On-chain KYCRegistry with time-bounded expiry gates vault access |
| **Accredited investor checks** | AccreditedInvestor registry available for restricted products |
| **Transfer restrictions** | Modular gate blocks non-compliant transfers |
| **Sanctions screening** | Global RestrictionList shared across all tokens |
| **Pause mechanism** | Immediate halt of all transfers for regulatory compliance |
| **UUPS upgradeability** | Stablecoin can be updated to meet new regulations |
| **Audit trail** | Immutable on-chain record of all operations |
| **Reserve transparency** | Daily on-chain reserve composition tracking |

---

## Recommended Legal Steps

1. **Form legal entity** — Delaware LLC or C-Corp via Stripe Atlas or Clerky
2. **Engage crypto-specialized counsel** — Review token classification per jurisdiction
3. **Draft AML/BSA program** — Formal compliance policies required before launch
4. **Assess state MTL requirements** — Money transmitter licensing for stablecoin issuance
5. **Monitor GENIUS Act** — Pending federal legislation may simplify stablecoin compliance
6. **Consider Reg D / Reg S exemptions** — For vault shares and derivative tokens if classified as securities
7. **Review MiCA requirements** — For EU distribution of any tokens
