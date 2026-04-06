// scripts/deployDerivsPhase2.ts — Deploy only CreditVault + ETFWrapper
// Run after deployDerivatives.ts partially succeeded (PT/YT/Splitter already live)
import hre from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// ── Already-deployed addresses ───────────────────────────────────────────────
const NUSD_PROXY   = "0x82671ab3119c8f73acc0ee43c6b167b46b948141" as `0x${string}`;
const YIELD_VAULT  = "0x6671D7937ae8b9120A673724FD26CF06e61b4F67" as `0x${string}`;
const PT_ADDRESS   = "0x7c3d64fefe665dd11524d66139109c67167a994a" as `0x${string}`;
const YT_ADDRESS   = "0x1fb28edc49b9336932417bce42f2256fbee59282" as `0x${string}`;
const SPLITTER     = "0xad9ba23e6a968b118eddbd15524bec1291f2889d" as `0x${string}`;

const connection = await hre.network.connect();
const viem = connection.viem;
const admin = (await viem.getWalletClients())[0].account.address;

console.log(`Completing derivatives deploy on ${connection.networkName} as ${admin}`);

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

// ── Write full deployments.json ──────────────────────────────────────────────
const jsonPath = resolve(import.meta.dirname ?? ".", "../frontend/src/lib/contracts/deployments.json");
mkdirSync(dirname(jsonPath), { recursive: true });

const addresses = {
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
  principalToken:       PT_ADDRESS,
  yieldToken:           YT_ADDRESS,
  yieldSplitter:        SPLITTER,
  creditVault:          creditVault.address,
  etfWrapper:           etfWrapper.address,
};

writeFileSync(jsonPath, JSON.stringify(addresses, null, 2) + "\n");
console.log(`\nAddresses written → ${jsonPath}`);
console.log("\n=== COMPLETE DEPLOYMENT ===");
for (const [k, v] of Object.entries(addresses)) console.log(`  ${k.padEnd(22)} ${v}`);
