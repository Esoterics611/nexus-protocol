// scripts/seed.ts — Deploy all contracts, seed data, output addresses JSON
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes } from "viem";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// Roles
const MINTER_ROLE    = keccak256(toBytes("MINTER_ROLE"));
const REPORTER_ROLE  = keccak256(toBytes("REPORTER_ROLE"));
const LOGGER_ROLE    = keccak256(toBytes("LOGGER_ROLE"));
const VERIFIER_ROLE  = keccak256(toBytes("VERIFIER_ROLE"));
const RESTRICTOR_ROLE = keccak256(toBytes("RESTRICTOR_ROLE"));

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const deployerAddress = deployer.account.address;

console.log("Seeding Nexus Protocol with account:", deployerAddress);
console.log("---");

// ══════════════════════════════════════════════════════════════════════
//  Step 1 — Deploy all contracts
// ══════════════════════════════════════════════════════════════════════
console.log("\n[1/8] Deploying all contracts...");

const restrictionList = await viem.deployContract("RestrictionList", [deployerAddress]);
const kycRegistry = await viem.deployContract("KYCRegistry", [deployerAddress]);
const accreditedInvestor = await viem.deployContract("AccreditedInvestor", [deployerAddress]);
const transferRestrictions = await viem.deployContract("TransferRestrictions", [
  deployerAddress, restrictionList.address, kycRegistry.address, false,
]);
const navOracle = await viem.deployContract("NAVOracle", [deployerAddress]);

// NexusStableCoin via UUPS proxy
const stablecoinImpl = await viem.deployContract("NexusStableCoin", []);
const initData = encodeFunctionData({
  abi: stablecoinImpl.abi,
  functionName: "initialize",
  args: ["Nexus USD", "NUSD", deployerAddress],
});
const proxy = await viem.deployContract("ERC1967Proxy", [stablecoinImpl.address, initData]);
const stablecoin = await viem.getContractAt("NexusStableCoin", proxy.address);
await stablecoin.write.setRestrictionList([restrictionList.address]);

const mintController = await viem.deployContract("MintController", [
  stablecoin.address, deployerAddress,
]);
await stablecoin.write.grantRole([MINTER_ROLE, mintController.address]);

// Deploy YieldVaultFactory and create vault through it
const vaultFactory = await viem.deployContract("YieldVaultFactory", [deployerAddress]);
const createVaultHash = await vaultFactory.write.createVault([
  stablecoin.address,
  navOracle.address,
  "Nexus Treasury Vault",
  "nxTREASURY",
]);
// Get vault address from factory
const vaultAddress = await vaultFactory.read.getVault([0n]);
const yieldVault = await viem.getContractAt("YieldVault", vaultAddress);

// Configure vault
await yieldVault.write.setTransferRestrictions([transferRestrictions.address]);

// Grant roles
await navOracle.write.grantRole([REPORTER_ROLE, deployerAddress]);
// Also grant REPORTER_ROLE to oracle-reporter service wallet if configured
const oracleReporterAddress = process.env.ORACLE_REPORTER_ADDRESS as `0x${string}` | undefined;
if (oracleReporterAddress) {
  await navOracle.write.grantRole([REPORTER_ROLE, oracleReporterAddress]);
  console.log(`  Oracle-reporter wallet granted REPORTER_ROLE: ${oracleReporterAddress}`);
}

const reserveTracker = await viem.deployContract("ReserveTracker", [deployerAddress]);
const auditLog = await viem.deployContract("AuditLog", [deployerAddress]);

await reserveTracker.write.grantRole([REPORTER_ROLE, deployerAddress]);
await auditLog.write.grantRole([LOGGER_ROLE, deployerAddress]);
await restrictionList.write.grantRole([RESTRICTOR_ROLE, deployerAddress]);
await kycRegistry.write.grantRole([VERIFIER_ROLE, deployerAddress]);
await accreditedInvestor.write.grantRole([VERIFIER_ROLE, deployerAddress]);

console.log("  All contracts deployed successfully.");

// ══════════════════════════════════════════════════════════════════════
//  Step 2 — Mint 1,000,000 NUSD via MintController
// ══════════════════════════════════════════════════════════════════════
console.log("\n[2/8] Minting 1,000,000 NUSD...");

const ONE_MILLION_NUSD = 1_000_000n * 10n ** 6n;
const TEN_MILLION_NUSD = 10_000_000n * 10n ** 6n;

await mintController.write.setMintAllocation([deployerAddress, TEN_MILLION_NUSD]);
console.log("  Allocation set: 10,000,000 NUSD for deployer");

await mintController.write.mint([deployerAddress, ONE_MILLION_NUSD]);
console.log("  Minted: 1,000,000 NUSD to deployer");

// ══════════════════════════════════════════════════════════════════════
//  Step 3 — Post initial NAV to oracle ($1M in assets)
// ══════════════════════════════════════════════════════════════════════
console.log("\n[3/8] Posting initial NAV...");

const block = await publicClient.getBlock();
const currentTimestamp = block.timestamp;
const NAV_1M = 1_000_000n * 10n ** 6n;

await navOracle.write.postNAV([NAV_1M, currentTimestamp]);
console.log(`  NAV posted: $1,000,000 at timestamp ${currentTimestamp}`);

// ══════════════════════════════════════════════════════════════════════
//  Step 4 — Post reserve entries
// ══════════════════════════════════════════════════════════════════════
console.log("\n[4/8] Posting reserve entries...");

await reserveTracker.write.postReserve(["T-Bill-3M", 800_000n * 10n ** 6n]);
await reserveTracker.write.postReserve(["USDC", 150_000n * 10n ** 6n]);
await reserveTracker.write.postReserve(["Cash", 50_000n * 10n ** 6n]);
console.log("  Reserves posted: T-Bill-3M $800k, USDC $150k, Cash $50k");

// ══════════════════════════════════════════════════════════════════════
//  Step 5 — Set KYC for deployer (expiry = 1 year from now)
// ══════════════════════════════════════════════════════════════════════
console.log("\n[5/8] Setting KYC for deployer...");

const oneYearFromNow = currentTimestamp + 365n * 24n * 60n * 60n;
await kycRegistry.write.setVerified([deployerAddress, oneYearFromNow]);
console.log(`  KYC set for deployer, expiry: ${oneYearFromNow}`);

// ══════════════════════════════════════════════════════════════════════
//  Step 6 — Log an audit entry
// ══════════════════════════════════════════════════════════════════════
console.log("\n[6/8] Logging audit entry...");

await auditLog.write.log(["DEPLOYMENT", "Protocol initialized and seeded", "0x"]);
console.log('  Audit logged: DEPLOYMENT — "Protocol initialized and seeded"');

// ══════════════════════════════════════════════════════════════════════
//  Step 7 — Post second NAV (simulated 1 day later, showing yield)
// ══════════════════════════════════════════════════════════════════════
console.log("\n[7/8] Posting second NAV (yield accrual)...");

const ONE_DAY = 86400n;
const NAV_WITH_YIELD = 1_000_123n * 10n ** 6n; // $1,000,123 (~4.5% APY)
await navOracle.write.postNAV([NAV_WITH_YIELD, currentTimestamp + ONE_DAY]);
console.log(`  NAV posted: $1,000,123 at timestamp ${currentTimestamp + ONE_DAY}`);

// ══════════════════════════════════════════════════════════════════════
//  Step 8 — Write deployment addresses JSON for frontend
// ══════════════════════════════════════════════════════════════════════
console.log("\n[8/8] Writing deployment addresses...");

const addresses = {
  stablecoin: stablecoin.address,
  stablecoinImpl: stablecoinImpl.address,
  mintController: mintController.address,
  navOracle: navOracle.address,
  yieldVault: yieldVault.address,
  vaultFactory: vaultFactory.address,
  reserveTracker: reserveTracker.address,
  auditLog: auditLog.address,
  restrictionList: restrictionList.address,
  kycRegistry: kycRegistry.address,
  accreditedInvestor: accreditedInvestor.address,
  transferRestrictions: transferRestrictions.address,
};

const jsonPath = resolve(import.meta.dirname ?? ".", "../frontend/src/lib/contracts/deployments.json");
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify(addresses, null, 2) + "\n");
console.log(`  Addresses written to ${jsonPath}`);

// ══════════════════════════════════════════════════════════════════════
//  Summary
// ══════════════════════════════════════════════════════════════════════
console.log("\n=== NEXUS PROTOCOL — SEED SUMMARY ===");
const contractList: [string, string][] = [
  ["NexusStableCoin (proxy)", stablecoin.address],
  ["MintController", mintController.address],
  ["NAVOracle", navOracle.address],
  ["YieldVault", yieldVault.address],
  ["YieldVaultFactory", vaultFactory.address],
  ["ReserveTracker", reserveTracker.address],
  ["AuditLog", auditLog.address],
  ["RestrictionList", restrictionList.address],
  ["KYCRegistry", kycRegistry.address],
  ["AccreditedInvestor", accreditedInvestor.address],
  ["TransferRestrictions", transferRestrictions.address],
];

for (const [name, addr] of contractList) {
  console.log(`  ${name.padEnd(28)} ${addr}`);
}
console.log("=====================================");
