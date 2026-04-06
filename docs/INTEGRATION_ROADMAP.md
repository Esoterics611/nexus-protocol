# Nexus Protocol — Integration Roadmap & Partner Research

## Overview

This document maps every integration point where the protocol touches traditional finance, identifies potential partners for each, and provides step-by-step next actions.

---

## Integration Map

```
NEXUS PROTOCOL (on-chain)          INTEGRATION LAYER              REAL WORLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━    ━━━━━━━━━━━━━━━━━━━━━━━━━    ━━━━━━━━━━━━━━━━━━━━

NexusStableCoin.mint()       ←──  bank-adapter confirms     ←── Customer wire received
                                  deposit at partner bank

NexusStableCoin.burn()       ───→ fiat-ramp-adapter         ───→ Wire sent to customer
                                  initiates wire

YieldVault.deposit()         ←──  custodian-adapter         ←── T-bills purchased
                                  confirms purchase

NAVOracle.postNAV()          ←──  nav-reporter fetches      ←── Fund admin calculates
                                  from fund admin API            daily NAV

RestrictionList.restrict()   ←──  sanctions-screener        ←── OFAC SDN list update
                                  flags address

KYCRegistry.setVerified()    ←──  kyc-verifier              ←── Identity provider
                                  checks status                  verifies customer
```

---

## 1. Banking Partner

**Need:** Hold USD reserves, process wire transfers for mint/burn

### Potential Partners

| Partner | Type | Crypto-Friendly | Min Requirements | Contact Path |
|---------|------|-----------------|------------------|-------------|
| **Mercury** | Neobank | Yes — serves crypto companies | Business formation docs, $0 min | Apply online: mercury.com |
| **Lead Bank** | Bank (MO) | Yes — partners with stablecoin issuers | Business entity, compliance program | Direct outreach |
| **Cross River Bank** | Bank (NJ) | Yes — backs Circle (USDC), Coinbase | Larger scale, compliance framework | Partnership inquiry |
| **Column** | Bank (CA) | Yes — crypto-native bank | Business entity, API integration | Apply: column.com |
| **Customers Bank** | Bank (PA) | Yes — runs CBIT (crypto payments) | Business entity, compliance docs | Direct outreach |
| **Signature Bank** | ~~Closed~~ | — | — | — |
| **Silvergate** | ~~Closed~~ | — | — | — |

### Step-by-Step Next Actions
1. **Now:** Form legal entity (LLC or C-Corp in Delaware or Wyoming)
2. **Now:** Open Mercury account for operational banking
3. **Month 1:** Draft compliance program document (AML/BSA/KYC policies)
4. **Month 2:** Approach Column or Lead Bank for reserve banking
5. **Month 3:** Negotiate API access for programmatic wire verification
6. **Until then:** Use testnet USDC as deposit asset, mock bank adapter

### Demo Alternative
- Mock adapter simulates wire confirmations with configurable delays
- Testnet USDC deposits bypass banking entirely

---

## 2. Custodian (Asset Custody)

**Need:** Hold actual T-bills and other underlying assets for the vault

### Potential Partners

| Partner | Type | Specialization | Min AUM | Contact Path |
|---------|------|---------------|---------|-------------|
| **Anchorage Digital** | Digital asset bank (OCC chartered) | Crypto + tokenized assets | Institutional | anchorage.com |
| **BitGo** | Qualified custodian | Crypto custody, DeFi integration | $1M+ | bitgo.com |
| **Fireblocks** | MPC custody platform | Institutional crypto, tokenization | Varies | fireblocks.com |
| **Copper.co** | Crypto custody | Institutional, DeFi | Varies | copper.co |
| **BNY Mellon** | Traditional custodian | T-bills, bonds (what Fidelity uses) | Very high | Enterprise sales only |
| **State Street** | Traditional custodian | T-bills, money markets | Very high | Enterprise sales only |

### Step-by-Step Next Actions
1. **Now:** Build mock custodian adapter that simulates custody confirmations
2. **Month 1:** Research Fireblocks tokenization SDK (most accessible for startups)
3. **Month 2:** Apply for BitGo or Anchorage institutional account
4. **Month 3:** Integrate custody API for asset verification
5. **Long-term:** For real T-bill custody, will need traditional custodian relationship

### Demo Alternative
- Mock custodian contract on-chain simulates asset holding
- ReserveTracker posts simulated reserve composition

---

## 3. Fund Administrator (NAV Calculation)

**Need:** Third-party calculation and certification of Net Asset Value

### Potential Partners

| Partner | Crypto Experience | Services | Contact Path |
|---------|------------------|----------|-------------|
| **NAV Consulting** | Yes — crypto fund admin | NAV, financial reporting | navconsulting.net |
| **MG Stover** | Yes — digital asset fund admin | NAV, audit support | mgstover.com |
| **Formidium** | Yes — crypto + DeFi | Fund admin, compliance | formidium.com |
| **Theorem Fund Services** | Yes — crypto-native | NAV, tax, compliance | theoremfund.com |
| **Citco** | Traditional + crypto | Full fund admin suite | citco.com (large scale) |

### Step-by-Step Next Actions
1. **Now:** Self-calculate NAV using T-bill yield data (mock oracle)
2. **Month 2:** Contact NAV Consulting or MG Stover for pricing
3. **Month 3:** Set up API feed from fund admin → oracle-reporter service
4. **Month 4:** Post certified NAV to on-chain NAVOracle via reporter

### Demo Alternative
- Mock NAV oracle simulates daily yield at ~4.5% APY
- Script posts incremental NAV updates matching T-bill benchmark rates

---

## 4. KYC/Identity Verification Provider

**Need:** Verify customer identity before allowing protocol access

### Potential Partners

| Partner | Type | Pricing | Integration | Contact Path |
|---------|------|---------|-------------|-------------|
| **Jumio** | ID verification | Per-verification | REST API | jumio.com |
| **Onfido** | ID + biometric | Per-verification | REST API, SDK | onfido.com |
| **Persona** | Identity platform | Usage-based | REST API, embedded | withpersona.com |
| **Sumsub** | KYC/AML platform | Per-verification | REST API, SDK | sumsub.com |
| **Plaid Identity** | Identity via bank | Included in Plaid | Plaid API | plaid.com |
| **Synaps** | Web3-native KYC | Per-verification | REST API, SDK | synaps.io |

### Step-by-Step Next Actions
1. **Now:** Allowlist-only access (admin manually adds KYC'd addresses)
2. **Month 1:** Evaluate Persona or Sumsub (best startup pricing)
3. **Month 2:** Build KYC adapter: user completes verification → service calls KYCRegistry.setVerified()
4. **Month 3:** Integrate with compliance service for automated verification flow

### Demo Alternative
- Admin manually calls `KYCRegistry.setVerified(address, expiry)` for demo users
- No public-facing KYC flow needed for tech demo

---

## 5. Sanctions Screening Data

**Need:** Screen addresses against OFAC SDN list and other sanctions databases

### Potential Partners

| Partner | Type | Crypto-Specific | Pricing | Contact Path |
|---------|------|-----------------|---------|-------------|
| **Chainalysis** | Blockchain analytics | Yes — KYT, Reactor | Enterprise | chainalysis.com |
| **Elliptic** | Blockchain analytics | Yes — Lens, Navigator | Enterprise | elliptic.co |
| **TRM Labs** | Blockchain analytics | Yes — risk scoring | Enterprise | trmlabs.com |
| **CipherTrace (Mastercard)** | Blockchain analytics | Yes | Enterprise | ciphertrace.com |
| **OFAC SDN List** | Government data | No (raw list) | Free | treasury.gov/ofac |
| **Comply Advantage** | AML screening | Partial | Per-search | complyadvantage.com |

### Step-by-Step Next Actions
1. **Now:** Build mock sanctions adapter with test denylist
2. **Month 1:** Download and parse OFAC SDN list (free, public data)
3. **Month 2:** Evaluate Chainalysis KYT or TRM Labs for on-chain address screening
4. **Month 3:** Integrate sanctions screening → RestrictionList.restrict() automation
5. **Ongoing:** Daily sanctions list update → compliance service syncs denylist

### Demo Alternative
- Mock sanctions list with test addresses
- Manual restrict/unrestrict via RestrictionList contract

---

## 6. Auditor (Reserve Attestation)

**Need:** Independent monthly attestation that reserves back issued tokens

### Potential Partners

| Partner | Type | Crypto Experience | Contact Path |
|---------|------|------------------|-------------|
| **Armanino** | CPA firm | Yes — attests for multiple stablecoin issuers | armanino.com |
| **Grant Thornton** | Big 4-adjacent | Yes — Circle's auditor | grantthornton.com |
| **WithumSmith+Brown** | CPA firm | Yes — crypto audit practice | withum.com |
| **Friedman LLP** | CPA firm | Yes — (formerly Tether's auditor) | friedmanllp.com |
| **KPMG / Deloitte / PwC / EY** | Big 4 | Limited crypto but growing | Enterprise only |

### Step-by-Step Next Actions
1. **Now:** Self-publish on-chain reserve proofs via ReserveTracker
2. **Month 3:** Contact Armanino or Withum for pricing on monthly attestation
3. **Month 4:** Set up audit-reporter service to generate attestation-ready data
4. **Month 6:** First independent reserve attestation

### Demo Alternative
- AuditLog events serve as transparent on-chain record
- ReserveTracker posts self-reported reserve composition

---

## 7. Treasury Dealer

**Need:** Buy/sell actual T-bills for the vault's reserve

### Potential Partners

| Partner | Type | Min Investment | Contact Path |
|---------|------|---------------|-------------|
| **Interactive Brokers** | Broker-dealer | $0 | ibkr.com (API available) |
| **Tradeweb** | Institutional platform | High | tradeweb.com |
| **BondCliQ** | Bond market platform | Institutional | bondcliq.com |
| **Fidelity Institutional** | Broker-dealer | Institutional | fidelity.com/institutional |
| **Charles River (State Street)** | OMS platform | Enterprise | crd.com |

### Step-by-Step Next Actions
1. **Now:** Simulate T-bill yields in mock oracle (~4.5% APY)
2. **Month 2:** Open Interactive Brokers institutional account (most accessible)
3. **Month 3:** Build treasury-dealer adapter to buy/sell T-bills via API
4. **Month 4:** Connect yield from actual T-bill holdings to NAVOracle

### Demo Alternative
- Mock oracle simulates daily NAV increase based on current T-bill rates
- No actual T-bill purchase needed for demo

---

## 8. Fiat On/Off Ramp

**Need:** Convert between fiat USD and stablecoin for end users

### Potential Partners

| Partner | Type | Integration | Contact Path |
|---------|------|-------------|-------------|
| **Circle (USDC)** | Stablecoin issuer | Circle Mint API | circle.com |
| **MoonPay** | Fiat ramp | Widget, API | moonpay.com |
| **Transak** | Fiat ramp | Widget, API | transak.com |
| **Ramp Network** | Fiat ramp | Widget, API | ramp.network |
| **Wyre** | Fiat ramp (sunset?) | API | wyre.com |
| **Stripe Crypto** | Payments | API | stripe.com |

### Step-by-Step Next Actions
1. **Now:** Accept testnet/mainnet USDC as deposit — no fiat ramp needed
2. **Month 3:** Integrate MoonPay or Transak widget in frontend
3. **Month 4:** For institutional: Circle Mint API for USDC ↔ USD
4. **Long-term:** Direct bank integration for wire-to-stablecoin

### Demo Alternative
- Users deposit USDC directly — no fiat ramp
- Frontend shows USDC deposit flow

---

## 9. Legal & Regulatory

**Need:** Legal entity structure, regulatory compliance, licenses

### Key Requirements

| Requirement | Description | Timeline |
|-------------|------------|----------|
| **Legal entity** | Delaware LLC or C-Corp | Immediate |
| **Legal counsel** | Crypto/fintech attorney | Month 1 |
| **State money transmitter** | Required for stablecoin in most US states | 6-12 months |
| **OCC charter** | Federal banking charter (optional, complex) | 1-2 years |
| **GENIUS Act compliance** | Pending federal stablecoin legislation | When enacted |
| **SEC / CFTC guidance** | Tokenized securities classification | Ongoing |

### Potential Legal Partners

| Firm | Specialization | Contact Path |
|------|---------------|-------------|
| **Anderson Kill** | Blockchain & crypto law | andersonkill.com |
| **Debevoise & Plimpton** | Digital assets, fintech | debevoise.com |
| **Davis Polk** | SEC/CFTC regulatory | davispolk.com |
| **Cooley** | Fintech, crypto startups | cooley.com |
| **a16z crypto legal** | Open-source legal templates | a16zcrypto.com/legal-resources |

### Step-by-Step Next Actions
1. **Now:** Form Delaware LLC (can do via Stripe Atlas or Clerky)
2. **Now:** Review a16z crypto legal templates for token issuance
3. **Month 1:** Engage crypto-specialized attorney for structure review
4. **Month 2:** Draft compliance program (AML/BSA/KYC policies)
5. **Month 3:** Assess state MTL requirements
6. **Ongoing:** Monitor GENIUS Act progress

---

## Priority Matrix

| Priority | Integration | Blocks | When Needed | Demo Workaround |
|----------|------------|--------|-------------|-----------------|
| 🔴 1 | Legal entity | Everything real | Before any real money | Operate as tech demo |
| 🔴 2 | Banking partner | Fiat on/off ramp | Before stablecoin launch | Testnet USDC |
| 🟡 3 | KYC provider | Public access | Before onboarding users | Allowlist-only |
| 🟡 4 | Sanctions data | Transfer screening | Before any transfers | Mock denylist |
| 🟡 5 | Custodian | Real asset backing | Before vault launch | Mock custodian |
| 🟡 6 | Fund administrator | Certified NAV | Before institutional clients | Self-calculated NAV |
| 🟢 7 | Auditor | Reserve attestation | Before scale | Self-published proofs |
| 🟢 8 | Treasury dealer | T-bill trading | Before vault launch | Simulated yield |
| 🟢 9 | Fiat ramp | User onboarding | Before retail launch | USDC deposits |

---

## Immediate Next Steps (This Month)

1. [ ] **Form legal entity** — Delaware LLC via Stripe Atlas or Clerky
2. [ ] **Open Mercury bank account** — operational banking
3. [ ] **Deploy contracts to Base Sepolia** — full testnet deployment
4. [ ] **Build mock adapters** for all 7 integration points
5. [ ] **Download and parse OFAC SDN list** — free sanctions data
6. [ ] **Review a16z crypto legal templates** — token issuance framework
7. [ ] **Write integration adapter interfaces** — TypeScript interfaces for all adapters
8. [ ] **Research Persona/Sumsub** — get KYC provider pricing

## Medium-Term (Months 2-3)

1. [ ] **Contact NAV Consulting** — fund admin pricing
2. [ ] **Apply for Fireblocks or BitGo** — custody account
3. [ ] **Open Interactive Brokers** — T-bill trading capability
4. [ ] **Engage crypto attorney** — structure review
5. [ ] **Integrate KYC provider** — automated verification flow
6. [ ] **Set up Chainalysis KYT trial** — sanctions screening

## Long-Term (Months 4-6)

1. [ ] **Reserve banking partner** — Column or Lead Bank
2. [ ] **First independent audit** — Armanino or Withum
3. [ ] **State MTL applications** — money transmitter licensing
4. [ ] **Mainnet deployment** — Base mainnet, then Ethereum
5. [ ] **Circle Mint integration** — institutional USDC ↔ USD
