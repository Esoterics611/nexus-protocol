// scripts/deployGateway.ts — Deploy ETHSwapGateway + MockPriceFeed to existing deployment
import hre from "hardhat";
import { keccak256, toBytes, parseEther } from "viem";

// Roles on NexusStableCoin
const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
const BURNER_ROLE = keccak256(toBytes("BURNER_ROLE"));

// ── Existing Base Sepolia addresses ────────────────────────────────────────
const NUSD_PROXY = "0x82671ab3119c8f73acc0ee43c6b167b46b948141" as const;

// Initial ETH/USD mock price: $2800.00 (8 decimals)
const INITIAL_ETH_PRICE = 280_000_000_000n; // 2800 * 1e8

// ETH to seed gateway reserves for redemptions (0.05 ETH — enough for demo)
const SEED_ETH = parseEther("0.05");

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const admin = deployer.account.address;

console.log(`Deploying ETHSwapGateway to ${connection.networkName} with account: ${admin}`);
console.log("---");

// 1. MockPriceFeed
const priceFeed = await viem.deployContract("MockPriceFeed", [
  INITIAL_ETH_PRICE,
  admin,
]);
console.log("MockPriceFeed:    ", priceFeed.address);
console.log(`  → Initial price: $${Number(INITIAL_ETH_PRICE) / 1e8}`);

// 2. ETHSwapGateway
const gateway = await viem.deployContract("ETHSwapGateway", [
  NUSD_PROXY,
  priceFeed.address,
  admin,
]);
console.log("ETHSwapGateway:   ", gateway.address);

// 3. Grant MINTER_ROLE + BURNER_ROLE on NUSD to gateway
const stablecoin = await viem.getContractAt("NexusStableCoin", NUSD_PROXY);

const mintTx = await stablecoin.write.grantRole([MINTER_ROLE, gateway.address]);
await publicClient.waitForTransactionReceipt({ hash: mintTx });
console.log("  → MINTER_ROLE granted to gateway");

const burnTx = await stablecoin.write.grantRole([BURNER_ROLE, gateway.address]);
await publicClient.waitForTransactionReceipt({ hash: burnTx });
console.log("  → BURNER_ROLE granted to gateway");

// 4. Seed ETH reserves into gateway
const seedTx = await deployer.sendTransaction({
  to: gateway.address,
  value: SEED_ETH,
});
await publicClient.waitForTransactionReceipt({ hash: seedTx });
console.log(`  → Seeded ${Number(SEED_ETH) / 1e18} ETH into gateway reserves`);

console.log("---");
console.log("Gateway deployment complete.");
console.log("");
console.log("Add to docs/CONTRACT_REGISTRY.md and frontend/src/lib/contracts/deployments.json:");
console.log(`  MockPriceFeed:  ${priceFeed.address}`);
console.log(`  ETHSwapGateway: ${gateway.address}`);
