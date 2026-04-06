# Nexus Protocol — Developer Docs Roadmap

> Plan for building out complete developer documentation and a public-facing API.
> Each section includes a **session prompt** — paste it at the start of a new Claude session to implement that piece.

---

## Current Documentation State

| Doc | Status | Description |
|-----|--------|-------------|
| `CLAUDE.md` | ✅ | Project guide for AI sessions |
| `docs/ARCHITECTURE.md` | ✅ | System architecture and contract relationships |
| `docs/DECISIONS.md` | ✅ | 9 Architecture Decision Records |
| `docs/CONTRACT_REGISTRY.md` | ✅ | All contracts with addresses, roles, wiring |
| `docs/E2E_WORKFLOWS.md` | ✅ | 7 end-to-end workflows with exact contract calls |
| `docs/TESTNET_DEPLOYMENT.md` | ✅ | Base Sepolia deployment addresses |
| `docs/INTEGRATION_ROADMAP.md` | ✅ | 9 integration points with partner research |
| `docs/UI_PLAN.md` | ✅ | SvelteKit UI architecture, 8 screen specs |
| `docs/PHASE_TRACKER.md` | ✅ | Phase progress tracking |
| `docs/OPS_GUIDE.md` | ✅ | Operations guide for running services |
| `docs/DEVELOPER_REFERENCE.md` | ✅ | Types, interfaces, data structures |
| `docs/DEVELOPER_DOCS_ROADMAP.md` | ✅ | This file |

---

## Planned Documentation & Features

### D1 — OpenAPI / Swagger Spec for the Indexer REST API

**What:** Auto-generate an OpenAPI 3.0 spec from the NestJS controllers using `@nestjs/swagger`. Host it at `/api/docs`.

**Why:** Lets external developers discover and test endpoints without reading source code. Required before any external integration.

**Session prompt:**
```
Review docs/DEVELOPER_REFERENCE.md sections 2.3 and 3 to understand the indexer REST API.
Read services/indexer/src/modules/events/events.controller.ts and services/indexer/src/main.ts.

Add NestJS Swagger documentation to the indexer service:
1. Install @nestjs/swagger and swagger-ui-express
2. Add ApiProperty decorators to response DTOs (create DTO classes in services/indexer/src/dto/)
3. Add ApiOperation, ApiQuery, ApiResponse decorators to all controller methods
4. Configure SwaggerModule in main.ts to serve /api/docs
5. Update docs/OPS_GUIDE.md to mention the Swagger UI URL
6. Rebuild and verify the Swagger UI is accessible at http://localhost:3001/api/docs

The API has these endpoints: GET /health, GET /api/nav-history, GET /api/vault-transactions,
GET /api/transfers, GET /api/reserve-history, GET /api/events, GET /api/indexer-status.
```

---

### D2 — SDK / Client Library (TypeScript)

**What:** Extract the frontend `indexer.ts` API client into a standalone publishable package at `packages/sdk/`. Include typed functions for all API endpoints plus on-chain read helpers.

**Why:** Enables external developers to build on Nexus without copying frontend code.

**Session prompt:**
```
Review docs/DEVELOPER_REFERENCE.md sections 2.3, 3, and 4 for the types and API contracts.
Read frontend/src/lib/api/indexer.ts and frontend/src/lib/contracts/index.ts.

Create a standalone TypeScript SDK package at packages/sdk/:
1. Set up packages/sdk/package.json (name: @nexus-protocol/sdk, ESM + CJS dual build)
2. Move and expand the indexer.ts API client into packages/sdk/src/indexer.ts
3. Add on-chain read helpers in packages/sdk/src/contracts.ts using viem
   - getVaultInfo(address, client) - returns share price, TVL, total supply
   - getNUSDBalance(address, client) - returns NUSD balance
   - getKYCStatus(address, client) - returns KYC approval + expiry
4. Export all types from packages/sdk/src/types.ts
5. Add packages/sdk/tsconfig.json and build script
6. Add a README at packages/sdk/README.md with usage examples
7. Wire it into the frontend as a local workspace dependency in package.json

Reference: docs/TESTNET_DEPLOYMENT.md for contract addresses.
```

---

### D3 — Contract NatSpec Docs (Solidity)

**What:** Ensure all contracts have complete NatSpec (`@notice`, `@param`, `@return`, `@dev`) on every public function and event. Generate HTML docs with `hardhat-docgen` or `forge doc`.

**Why:** Required for institutional due diligence. Makes audit reports clearer.

**Session prompt:**
```
Review docs/ARCHITECTURE.md and docs/CONTRACT_REGISTRY.md to understand the contract system.
Read all contracts in contracts/ (vaults/, stablecoin/, compliance/, accounting/).

For each contract, add complete NatSpec documentation:
- @title on the contract
- @notice describing what each function does for end users
- @dev with implementation notes for developers
- @param for every parameter
- @return for every return value
- @notice on every event with what it signals

Focus first on: NexusStableCoin, MintController, YieldVault, NAVOracle, ReserveTracker.
After adding NatSpec, run: npx hardhat compile
Verify it compiles clean with 0 errors and 0 warnings.
Then run npx hardhat test to confirm no test regressions.
```

---

### D4 — Integration Guide

**What:** A guide for external protocols wanting to integrate with Nexus. Covers: holding NUSD, depositing into vaults, reading NAV, checking KYC status, compliance requirements.

**Why:** Nexus is designed for composability. External DeFi protocols need clear integration docs.

**Session prompt:**
```
Review docs/E2E_WORKFLOWS.md, docs/ARCHITECTURE.md, and docs/DEVELOPER_REFERENCE.md section 4.

Create docs/INTEGRATION_GUIDE.md covering:
1. Overview: what Nexus Protocol exposes to external protocols
2. Reading NUSD balances and total supply (ERC-20 standard)
3. Depositing into a YieldVault (ERC-4626 standard + KYC requirement)
   - Checking KYC status before depositing
   - Approve + deposit flow with exact ABI calls
4. Reading vault NAV and share price from NAVOracle
5. Checking if an address is on the restriction list
6. Minting NUSD via MintController (requires allocation — explain the process)
7. Code examples in TypeScript using viem
8. Error handling: what reverts to expect and what they mean

Use the contract addresses from docs/TESTNET_DEPLOYMENT.md in examples.
```

---

### D5 — Error Code Reference

**What:** Document every custom Solidity error and revert string across all contracts, with what causes them and how to handle them in frontends/integrations.

**Why:** The frontend `TxButton` already parses custom errors — this doc makes that transparent to external devs.

**Session prompt:**
```
Review docs/DEVELOPER_REFERENCE.md section 4 and read all contracts in contracts/.

Create docs/ERROR_REFERENCE.md:
1. List every custom error defined in each contract (using custom error syntax: error Foo())
2. List every require() revert string
3. For each error: what triggers it, which role/state is required to avoid it
4. Map errors to their ABI selectors (4-byte hex) for frontend error parsing
5. Show TypeScript code for how the frontend's TxButton parses these (read frontend/src/lib/components/TxButton.svelte)

Organize by contract. Include a quick-reference table at the top.
```

---

### D6 — Architecture Decision Records (ADR) — Expand

**What:** Add new ADRs for decisions made in Phase 3 and 4: indexer design choices, why Drizzle over Prisma, why NestJS over Express, SvelteKit vs Next.js, BigInt serialization approach.

**Session prompt:**
```
Read docs/DECISIONS.md to see the existing 9 ADRs and their format.

Add the following new ADRs to docs/DECISIONS.md:
- ADR-010: NestJS for microservices (vs Express, Fastify, tRPC)
- ADR-011: Drizzle ORM (vs Prisma, TypeORM, raw SQL)
- ADR-012: Polling indexer (vs The Graph, Ponder, Subgraph)
- ADR-013: SvelteKit (vs Next.js, Nuxt, plain Vite)
- ADR-014: BigInt serialization via toJSON patch (vs DTO transformation, mode: "number")
- ADR-015: viem (vs ethers.js v6)

For each ADR follow the existing format: Status, Context, Decision, Consequences.
Be concise — 5-10 lines per ADR. Reference specific technical trade-offs.
```

---

### D7 — Public API Documentation Site

**What:** A simple static documentation site (VitePress or Docusaurus) at `docs-site/` that publishes all markdown docs as a browsable website with search.

**Why:** Internal markdown is fine for now. For institutional adoption, a real documentation website is expected.

**Session prompt:**
```
Review all files in docs/ to understand what documentation exists.

Set up a VitePress documentation site at docs-site/:
1. Initialize VitePress (npm create vitepress@latest docs-site)
2. Configure docs-site/.vitepress/config.ts with:
   - Site title: "Nexus Protocol Developer Docs"
   - Sidebar with all existing docs organized by category:
     * Getting Started: ARCHITECTURE, PHASE_TRACKER
     * Developer Reference: DEVELOPER_REFERENCE, DEVELOPER_DOCS_ROADMAP
     * Integration: INTEGRATION_GUIDE (placeholder), E2E_WORKFLOWS
     * Contracts: CONTRACT_REGISTRY, DECISIONS, ERROR_REFERENCE (placeholder)
     * Operations: OPS_GUIDE
3. Copy/symlink docs/*.md into docs-site/
4. Add npm scripts to root package.json: docs:dev, docs:build
5. Add docs-site/README.md explaining how to run locally
6. Do NOT deploy yet — just make it work locally with npm run docs:dev
```

---

### D8 — Postman / Bruno Collection

**What:** An API collection (Postman JSON or Bruno files) for the indexer REST API with pre-filled example requests for all endpoints.

**Why:** QA engineers and backend developers need a quick way to test the API without writing code.

**Session prompt:**
```
Review docs/DEVELOPER_REFERENCE.md section 2.3 for the complete REST API definition.

Create a Bruno API collection at api-collection/:
1. Install Bruno collection format (no account required, open source)
2. Create api-collection/bruno.json with the collection metadata
3. Add one .bru file per endpoint:
   - health.bru — GET http://localhost:3001/health
   - nav-history.bru — GET /api/nav-history with vault address query param
   - vault-transactions.bru — GET /api/vault-transactions with vault + owner params
   - transfers.bru — GET /api/transfers with address param
   - reserve-history.bru — GET /api/reserve-history
   - events.bru — GET /api/events with contract + event params
   - indexer-status.bru — GET /api/indexer-status
4. Use the Base Sepolia testnet addresses from docs/TESTNET_DEPLOYMENT.md as default values
5. Add a README at api-collection/README.md explaining how to import into Bruno or Postman
```

---

## Priority Order

For the next development sessions, tackle in this order:

1. **D1 — Swagger/OpenAPI** — lowest effort, highest leverage for external devs
2. **D3 — Contract NatSpec** — required before any audit or institutional review
3. **D5 — Error Reference** — needed before mainnet (devs need to handle errors)
4. **D2 — SDK** — needed when the first external integrator appears
5. **D6 — ADRs** — good hygiene, low effort
6. **D4 — Integration Guide** — needed for DeFi composability partnerships
7. **D7 — Docs site** — nice to have before public launch
8. **D8 — Bruno collection** — QA tooling, do last

---

## Notes for Future Sessions

- Always read `docs/PHASE_TRACKER.md` at the start of each session
- Always read `CLAUDE.md` for project conventions
- The memory files in `.claude/projects/` track bugs fixed and decisions made
- Contract addresses live in `docs/TESTNET_DEPLOYMENT.md` and `services/indexer/.env`
- Running services: `docker compose up -d` from repo root
- Frontend: `cd frontend && npm run dev`
