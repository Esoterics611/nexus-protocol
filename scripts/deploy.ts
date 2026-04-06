// scripts/deploy.ts — Nexus Protocol full deployment
import hre from "hardhat";
import { encodeFunctionData, keccak256, toBytes, getContractAddress } from "viem";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// Role hashes
const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
const REPORTER_ROLE = keccak256(toBytes("REPORTER_ROLE"));
const LOGGER_ROLE = keccak256(toBytes("LOGGER_ROLE"));
const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const admin = deployer.account.address;
const networkName = connection.networkName ?? "hardhat";

console.log(`Deploying Nexus Protocol to ${networkName} with account: ${admin}`);
console.log("---");

// 1. RestrictionList
const restrictionList = await viem.deployContract("RestrictionList", [admin], { gas: 1000000n });
console.log("RestrictionList:", restrictionList.address);

// 2. KYCRegistry
const kycRegistry = await viem.deployContract("KYCRegistry", [admin], { gas: 1000000n });
console.log("KYCRegistry:", kycRegistry.address);

// 3. AccreditedInvestor
const accreditedInvestor = await viem.deployContract("AccreditedInvestor", [admin], { gas: 1000000n });
console.log("AccreditedInvestor:", accreditedInvestor.address);

// 4. TransferRestrictions
const transferRestrictions = await viem.deployContract("TransferRestrictions", [
  admin,
  restrictionList.address,
  kycRegistry.address,
  false,
], { gas: 1000000n });
console.log("TransferRestrictions:", transferRestrictions.address);

// 5. NAVOracle
const navOracle = await viem.deployContract("NAVOracle", [admin], { gas: 1000000n });
console.log("NAVOracle:", navOracle.address);

// 6. NexusStableCoin — UUPS proxy
const stablecoinImpl = await viem.deployContract("NexusStableCoin", [], { gas: 3000000n });
console.log("NexusStableCoin (impl):", stablecoinImpl.address);

const initData = encodeFunctionData({
  abi: stablecoinImpl.abi,
  functionName: "initialize",
  args: ["Nexus USD", "NUSD", admin],
});

const proxy = await viem.deployContract("ERC1967Proxy", [
  stablecoinImpl.address,
  initData,
], { gas: 1000000n }); // explicit gas — drpc pre-simulation fails on delegatecall init
console.log("NexusStableCoin (proxy):", proxy.address);

const stablecoin = await viem.getContractAt("NexusStableCoin", proxy.address);

// 7. Set RestrictionList on stablecoin
await stablecoin.write.setRestrictionList([restrictionList.address]);
console.log("  → RestrictionList set on stablecoin");

// 8. MintController
const mintController = await viem.deployContract("MintController", [
  proxy.address,
  admin,
], { gas: 800000n });
console.log("MintController:", mintController.address);

// 9. Grant MINTER_ROLE to MintController
await stablecoin.write.grantRole([MINTER_ROLE, mintController.address]);
console.log("  → MINTER_ROLE granted to MintController");

// 10. YieldVaultFactory — deploy for registry, but also deploy vault directly
// drpc fails to execute inner-deploy txs from factory (bytecode too large for pre-sim).
// Workaround: deploy YieldVault directly; still deploy factory for the registry/ABI.
const vaultFactory = await viem.deployContract("YieldVaultFactory", [admin], { gas: 5000000n });
console.log("YieldVaultFactory:", vaultFactory.address);

// Deploy vault directly (avoids factory's inner-deploy drpc issue)
const yieldVault = await viem.deployContract("YieldVault", [
  proxy.address,
  navOracle.address,
  "Nexus Treasury Vault",
  "nxTREASURY",
], { gas: 3000000n });
console.log("YieldVault (direct):", yieldVault.address);

// 11. Set TransferRestrictions on YieldVault
await yieldVault.write.setTransferRestrictions([transferRestrictions.address]);
console.log("  → TransferRestrictions set on YieldVault");

// 12. Grant REPORTER_ROLE on NAVOracle (admin + oracle-reporter service wallet if configured)
await navOracle.write.grantRole([REPORTER_ROLE, admin]);
console.log("  → REPORTER_ROLE granted on NAVOracle (admin)");

// If ORACLE_REPORTER_ADDRESS is set in the environment, grant REPORTER_ROLE to the
// oracle-reporter service wallet so it can post NAV without admin involvement.
const oracleReporterAddress = process.env.ORACLE_REPORTER_ADDRESS as `0x${string}` | undefined;
if (oracleReporterAddress) {
  await navOracle.write.grantRole([REPORTER_ROLE, oracleReporterAddress]);
  console.log(`  → REPORTER_ROLE granted on NAVOracle (oracle-reporter: ${oracleReporterAddress})`);
}

// 13. ReserveTracker
const reserveTracker = await viem.deployContract("ReserveTracker", [admin], { gas: 800000n });
console.log("ReserveTracker:", reserveTracker.address);

// 14. AuditLog
const auditLog = await viem.deployContract("AuditLog", [admin], { gas: 800000n });
console.log("AuditLog:", auditLog.address);

// 15-18. Grant remaining roles
await reserveTracker.write.grantRole([REPORTER_ROLE, admin]);
console.log("  → REPORTER_ROLE granted on ReserveTracker");

await auditLog.write.grantRole([LOGGER_ROLE, admin]);
console.log("  → LOGGER_ROLE granted on AuditLog");

await kycRegistry.write.grantRole([VERIFIER_ROLE, admin]);
console.log("  → VERIFIER_ROLE granted on KYCRegistry");

await accreditedInvestor.write.grantRole([VERIFIER_ROLE, admin]);
console.log("  → VERIFIER_ROLE granted on AccreditedInvestor");

// =========================================================================
// Phase 2: Derivatives
// =========================================================================

// 20. Get current block timestamp for maturity (365 days from now)
const block = await publicClient.getBlock();
const maturity = block.timestamp + BigInt(365 * 24 * 60 * 60);
console.log(`\nPhase 2 — Derivatives (maturity: ${new Date(Number(maturity) * 1000).toISOString()})`);

// 22. Capture nonce BEFORE PT so we can predict splitter precisely.
//     PT at nonceNow, YT at nonceNow+1, Splitter at nonceNow+2.
const nonceBeforePT = await publicClient.getTransactionCount({ address: admin });
const predictedSplitterAddr = getContractAddress({
  from: admin,
  nonce: BigInt(nonceBeforePT) + 2n,
});

// 21. Deploy PrincipalToken
const pt = await viem.deployContract("PrincipalToken", [
  "PT Nexus Treasury",
  "PT-TREASURY",
  maturity,
  stablecoin.address,
  admin,
], { gas: 2000000n });
console.log("PrincipalToken:", pt.address);

// 23. Deploy YieldToken (references predicted splitter address for the circular dep)
const yt = await viem.deployContract("YieldToken", [
  "YT Nexus Treasury",
  "YT-TREASURY",
  maturity,
  predictedSplitterAddr,
  stablecoin.address,
  admin,
], { gas: 2000000n });
console.log("YieldToken:", yt.address);

// 24. Deploy YieldSplitter (address must match prediction)
const yieldSplitter = await viem.deployContract("YieldSplitter", [
  yieldVault.address,
  pt.address,
  yt.address,
  maturity,
  admin,
], { gas: 2000000n });
console.log("YieldSplitter:", yieldSplitter.address);
if (yieldSplitter.address.toLowerCase() !== predictedSplitterAddr.toLowerCase()) {
  throw new Error(`YieldSplitter address mismatch: expected ${predictedSplitterAddr}, got ${yieldSplitter.address}`);
}

// 25. Grant MINTER_ROLE on PT + YT to YieldSplitter
await pt.write.grantRole([MINTER_ROLE, yieldSplitter.address]);
console.log("  → MINTER_ROLE granted on PrincipalToken to YieldSplitter");
await yt.write.grantRole([MINTER_ROLE, yieldSplitter.address]);
console.log("  → MINTER_ROLE granted on YieldToken to YieldSplitter");

// 26. Deploy CreditVault (150% collateral, 120% liquidation, 5% borrow rate, 5% liq discount)
const creditVault = await viem.deployContract("CreditVault", [
  yieldVault.address,
  stablecoin.address,
  15000n, // collateralRatioBps
  12000n, // liquidationRatioBps
  500n,   // borrowRateBps (5% APY)
  500n,   // liquidationDiscountBps (5%)
  admin,
], { gas: 2000000n });
console.log("CreditVault:", creditVault.address);

// 27. Deploy ETFWrapper with [YieldVault: 100% weight]
const etfWrapper = await viem.deployContract("ETFWrapper", [
  stablecoin.address,
  [yieldVault.address],
  [10000n],
  "Nexus ETF Basket",
  "nxETF",
  admin,
], { gas: 2000000n });
console.log("ETFWrapper:", etfWrapper.address);

// 19. Write addresses JSON for frontend
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
  // Phase 2 derivatives
  principalToken: pt.address,
  yieldToken: yt.address,
  yieldSplitter: yieldSplitter.address,
  creditVault: creditVault.address,
  etfWrapper: etfWrapper.address,
};

const jsonPath = resolve(import.meta.dirname ?? ".", "../frontend/src/lib/contracts/deployments.json");
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, JSON.stringify(addresses, null, 2) + "\n");
console.log(`\nAddresses written to ${jsonPath}`);

// Summary
console.log("\n=== NEXUS PROTOCOL — DEPLOYMENT SUMMARY ===");
const contracts: [string, string][] = [
  ["RestrictionList", restrictionList.address],
  ["KYCRegistry", kycRegistry.address],
  ["AccreditedInvestor", accreditedInvestor.address],
  ["TransferRestrictions", transferRestrictions.address],
  ["NAVOracle", navOracle.address],
  ["NexusStableCoin (impl)", stablecoinImpl.address],
  ["NexusStableCoin (proxy)", stablecoin.address],
  ["MintController", mintController.address],
  ["YieldVaultFactory", vaultFactory.address],
  ["YieldVault", yieldVault.address],
  ["ReserveTracker", reserveTracker.address],
  ["AuditLog", auditLog.address],
  ["--- Phase 2: Derivatives ---", ""],
  ["PrincipalToken", pt.address],
  ["YieldToken", yt.address],
  ["YieldSplitter", yieldSplitter.address],
  ["CreditVault", creditVault.address],
  ["ETFWrapper", etfWrapper.address],
];

for (const [name, addr] of contracts) {
  if (addr === "") console.log(`\n  ${name}`);
  else console.log(`  ${name.padEnd(28)} ${addr}`);
}
console.log("===========================================");
