// scripts/deployDerivatives.ts — Deploy Phase 2 derivatives on top of existing Phase 1
// Uses Phase 1 addresses from CONTRACT_REGISTRY.md (Base Sepolia deployment 2026-04-05)
import hre from "hardhat";
import { keccak256, toBytes, getContractAddress } from "viem";
import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));

// ── Phase 1 addresses (Base Sepolia — 2026-04-05) ───────────────────────────
const NUSD_PROXY      = "0x82671ab3119c8f73acc0ee43c6b167b46b948141" as `0x${string}`;
const YIELD_VAULT     = "0x6671D7937ae8b9120A673724FD26CF06e61b4F67" as `0x${string}`;

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const admin = deployer.account.address;

console.log(`Deploying derivatives to ${connection.networkName} with account: ${admin}`);

// Get current block for maturity (365 days from now)
const block = await publicClient.getBlock();
const maturity = block.timestamp + BigInt(365 * 24 * 60 * 60);
console.log(`Maturity: ${new Date(Number(maturity) * 1000).toISOString()}\n`);

// ── 1. PrincipalToken ────────────────────────────────────────────────────────
const nonceBeforePT = await publicClient.getTransactionCount({ address: admin });
const predictedSplitterAddr = getContractAddress({
  from: admin,
  nonce: BigInt(nonceBeforePT) + 2n, // PT at nonce N, YT at N+1, Splitter at N+2
});

const pt = await viem.deployContract("PrincipalToken", [
  "PT Nexus Treasury", "PT-TREASURY", maturity, NUSD_PROXY, admin,
], { gas: 2000000n });
console.log("PrincipalToken:", pt.address);

// ── 2. YieldToken ─────────────────────────────────────────────────────────────
const yt = await viem.deployContract("YieldToken", [
  "YT Nexus Treasury", "YT-TREASURY", maturity, predictedSplitterAddr, NUSD_PROXY, admin,
], { gas: 2000000n });
console.log("YieldToken:", yt.address);

// ── 3. YieldSplitter ─────────────────────────────────────────────────────────
const yieldSplitter = await viem.deployContract("YieldSplitter", [
  YIELD_VAULT, pt.address, yt.address, maturity, admin,
], { gas: 2000000n });
console.log("YieldSplitter:", yieldSplitter.address);
if (yieldSplitter.address.toLowerCase() !== predictedSplitterAddr.toLowerCase()) {
  throw new Error(`YieldSplitter address mismatch: expected ${predictedSplitterAddr}, got ${yieldSplitter.address}`);
}

// ── 4. Grant MINTER_ROLE to YieldSplitter ────────────────────────────────────
await pt.write.grantRole([MINTER_ROLE, yieldSplitter.address]);
console.log("  → MINTER_ROLE granted on PT to YieldSplitter");
await yt.write.grantRole([MINTER_ROLE, yieldSplitter.address]);
console.log("  → MINTER_ROLE granted on YT to YieldSplitter");

// ── 5. CreditVault ───────────────────────────────────────────────────────────
const creditVault = await viem.deployContract("CreditVault", [
  YIELD_VAULT, NUSD_PROXY, 15000n, 12000n, 500n, 500n, admin,
], { gas: 2000000n });
console.log("CreditVault:", creditVault.address);

// ── 6. ETFWrapper ─────────────────────────────────────────────────────────────
const etfWrapper = await viem.deployContract("ETFWrapper", [
  NUSD_PROXY, [YIELD_VAULT], [10000n], "Nexus ETF Basket", "nxETF", admin,
], { gas: 2000000n });
console.log("ETFWrapper:", etfWrapper.address);

// ── Write addresses JSON ─────────────────────────────────────────────────────
const jsonPath = resolve(import.meta.dirname ?? ".", "../frontend/src/lib/contracts/deployments.json");
mkdirSync(dirname(jsonPath), { recursive: true });

// Merge with Phase 1 addresses
const phase1 = {
  stablecoin:           NUSD_PROXY,
  stablecoinImpl:       "0x417b8aa2092298ebc23086571a14c4802984ee9b",
  mintController:       "0xee9b15f35ea7a9920c38ac1aacd5af265931886a",
  navOracle:            "0x28dc5ccc6a97675b7def7b4c4179b85127b698f3",
  yieldVault:           YIELD_VAULT,
  vaultFactory:         "0x7802ee123ef4a834987f69ed020da67881ce86b0",
  reserveTracker:       "0x9e9abd3734140eb7de220e190cc63436405ab219",
  auditLog:             "0xbf2f6169366b4971b6a1918af34b13f04ad1cc2c",
  restrictionList:      "0xea1ea3239ac1731acb6cffbe666fa6ff55e5a669",
  kycRegistry:          "0xadac3b940503626d5c72e202bf165c572d3ea11a",
  accreditedInvestor:   "0xd30fc13df30b31bc6d4c5fe7e3ee3877093fcf31",
  transferRestrictions: "0xbaa4050fef138f3f9dc19373db6b57860059c5a9",
  priceFeed:            "0xf6752cf9665db80a396073c66ac8df4b4b5327be",
  swapGateway:          "0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b",
};

const addresses = {
  ...phase1,
  principalToken: pt.address,
  yieldToken:     yt.address,
  yieldSplitter:  yieldSplitter.address,
  creditVault:    creditVault.address,
  etfWrapper:     etfWrapper.address,
};

writeFileSync(jsonPath, JSON.stringify(addresses, null, 2) + "\n");
console.log(`\nAddresses written → ${jsonPath}`);

console.log("\n=== NEXUS PROTOCOL — PHASE 2 DEPLOYMENT SUMMARY ===");
console.log(`  ${"PrincipalToken".padEnd(20)} ${pt.address}`);
console.log(`  ${"YieldToken".padEnd(20)} ${yt.address}`);
console.log(`  ${"YieldSplitter".padEnd(20)} ${yieldSplitter.address}`);
console.log(`  ${"CreditVault".padEnd(20)} ${creditVault.address}`);
console.log(`  ${"ETFWrapper".padEnd(20)} ${etfWrapper.address}`);
console.log(`  Maturity: ${new Date(Number(maturity) * 1000).toISOString()}`);
console.log("====================================================");
