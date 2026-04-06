# Nexus Protocol — Session Prompts

> Standalone prompts to paste at the start of each new session.
> Each prompt is self-contained — the AI will read the referenced docs to get up to speed.

---

## PROMPT A: Derivatives (Phase 2) — Use Claude Opus

Paste this at the start of a new Opus session:

```
You are working on Nexus Protocol, an institutional digital asset protocol.
Before starting, read these files in order:
1. CLAUDE.md — project conventions, tech stack, import rules
2. docs/PHASE_TRACKER.md — where we are
3. docs/DERIVATIVES_PLAN.md — the full derivatives architecture and implementation plan
4. docs/DEVELOPER_REFERENCE.md — types and interfaces used across the stack

Context:
- Phase 1 is complete: ERC-4626 vaults, NUSD stablecoin, compliance layer, 102 tests passing
- Phase 3 indexer is running in Docker
- Phase 4 frontend is mostly complete
- Phase 2 (derivatives) is next — NO services need to be completed first

Your task: implement Phase 2, Step 1 — the YieldSplitter primitive.

Use the session prompt in docs/DERIVATIVES_PLAN.md section 8, "Session: Build YieldSplitter".

Key constraints:
- Hardhat v3 ESM project (package.json has "type": "module")
- OpenZeppelin v5.6 (capitalized import paths: token/ERC20/ERC20.sol)
- Viem for tests, not ethers.js
- All tests must pass before ending the session
- Update docs/PHASE_TRACKER.md when done

Run: npx hardhat test — must show all tests green before finishing.
```

---

## PROMPT B: Remaining Services (Phase 3) — Use Claude Sonnet

Paste this at the start of a new Sonnet session:

```
You are working on Nexus Protocol, an institutional digital asset protocol.
Before starting, read these files in order:
1. CLAUDE.md — project conventions
2. docs/PHASE_TRACKER.md — where we are (Phase 3 services, items 4-7 are pending)
3. docs/OPS_GUIDE.md — how the existing Docker stack works
4. docs/DEVELOPER_REFERENCE.md — types and interfaces

Context:
- Phase 3 items 1-3 are DONE: event indexer, REST API, frontend API client
- Docker stack is running: docker compose up -d from repo root
  starts postgres (port 5432) + indexer (port 3001)
- The root docker-compose.yml has commented stubs for all future services

Your task: implement Phase 3, item 4 — the Oracle Reporter service.

The oracle reporter is a NestJS microservice that:
- Reads the current NAV from a price adapter (mock in dev, real in prod)
- Posts NAV to the NAVOracle contract on Base Sepolia once per day
- Needs REPORTER_ROLE on the NAVOracle contract (deployer must grant this)

Build it at: services/oracle-reporter/

Architecture to follow (mirrors services/indexer/):
- NestJS application
- Dockerfile (multi-stage, node:22-alpine)
- .env.example with all required vars
- src/config/env.ts for config loading
- src/modules/reporter/reporter.service.ts — the posting logic
  - Uses viem to call NAVOracle.postNAV()
  - Needs a REPORTER_PRIVATE_KEY env var (wallet that has REPORTER_ROLE)
  - Mock price adapter returns totalAssets = current vault totalAssets from on-chain
- src/main.ts — NestJS bootstrap on port 3002
- Health endpoint at /health

After building:
1. Uncomment the oracle-reporter block in docker-compose.yml
2. Add REPORTER_PRIVATE_KEY to .env.example (never commit actual key)
3. Run docker compose build oracle-reporter
4. Run docker compose up -d oracle-reporter
5. Verify with docker compose logs oracle-reporter

Update docs/PHASE_TRACKER.md Phase 3 item 4 to ✅ when done.
```

---

## PROMPT C: CreditVault + Full Derivatives Deploy — Use Claude Opus

After derivatives Step 1-4 are done, paste this to finish:

```
You are working on Nexus Protocol.
Read CLAUDE.md, docs/PHASE_TRACKER.md, docs/DERIVATIVES_PLAN.md before starting.

Phase 2 steps 1-4 (YieldSplitter and StructuredProduct) are complete.

Your task: implement Phase 2 Steps 5-9 per docs/DERIVATIVES_PLAN.md section 8:
- Build CreditVault
- Build ETFWrapper
- Update deploy script for all derivatives
- Deploy to Base Sepolia
- Update TESTNET_DEPLOYMENT.md and PHASE_TRACKER.md

Run npx hardhat test — full suite must pass before finishing.
```

---

## PROMPT E: E2E Test Suite + Data Seeding — Use Claude Sonnet

Paste this at the start of a new Sonnet session (or use the more detailed prompt in docs/TESTING_PLAN.md):

```
You are working on Nexus Protocol.
Read CLAUDE.md, docs/PHASE_TRACKER.md, and docs/TESTING_PLAN.md before starting.

docs/TESTING_PLAN.md section 7 contains your complete implementation spec.
Follow it exactly, building in the 4 phases described.

Key points:
- Build at tests/e2e/ inside this repo (separate package.json)
- Frontend uses window.ethereum directly (wallet.ts) — inject EIP-1193 mock via Playwright
- 10 HD wallets from one mnemonic, roles assigned per the plan
- workers: 1 (sequential — real testnet txs, avoid nonce conflicts)
- Start with generate-wallets script and 01-connect-wallet.spec.ts first
- Full detailed prompt is at the bottom of docs/TESTING_PLAN.md
```

---

## PROMPT D: Wire Derivatives into Indexer + Frontend — Use Claude Sonnet

After derivatives are deployed:

```
You are working on Nexus Protocol.
Read CLAUDE.md, docs/PHASE_TRACKER.md, docs/DERIVATIVES_PLAN.md section 7 before starting.

Derivative contracts are now deployed. Your task: wire them into the off-chain stack.

Follow the session prompt in docs/DERIVATIVES_PLAN.md section 8,
"Session: Wire Derivatives into Indexer + Frontend".

The indexer is in services/indexer/. Docker runs via docker compose up -d from repo root.
The frontend is in frontend/ using SvelteKit + Svelte 5.

After completing:
- docker compose logs -f indexer should show derivative events being indexed
- http://localhost:3001/api/split-positions should return valid JSON
- http://localhost:5173/derivatives should render without errors

Update docs/PHASE_TRACKER.md Phase 3 item 4 (indexer) and Phase 4 (frontend) when done.
```
