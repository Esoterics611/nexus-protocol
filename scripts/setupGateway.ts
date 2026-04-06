// scripts/setupGateway.ts — grant roles + seed ETH for already-deployed gateway
import hre from "hardhat";
import { keccak256, toBytes, parseEther } from "viem";

const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
const BURNER_ROLE  = keccak256(toBytes("BURNER_ROLE"));

const NUSD_PROXY   = "0x82671ab3119c8f73acc0ee43c6b167b46b948141" as const;
const GATEWAY      = "0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b" as const;
const SEED_ETH     = parseEther("0.05");

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

console.log("Setting up gateway roles + reserves...");

const stablecoin = await viem.getContractAt("NexusStableCoin", NUSD_PROXY);

// Check current state before granting
const hasMinter = await stablecoin.read.hasRole([MINTER_ROLE, GATEWAY]);
const hasBurner = await stablecoin.read.hasRole([BURNER_ROLE, GATEWAY]);
console.log(`MINTER_ROLE already granted: ${hasMinter}`);
console.log(`BURNER_ROLE already granted: ${hasBurner}`);

if (!hasMinter) {
  const tx = await stablecoin.write.grantRole([MINTER_ROLE, GATEWAY]);
  await publicClient.waitForTransactionReceipt({ hash: tx });
  console.log("  → MINTER_ROLE granted");
} else {
  console.log("  → MINTER_ROLE already set, skipping");
}

if (!hasBurner) {
  const tx = await stablecoin.write.grantRole([BURNER_ROLE, GATEWAY]);
  await publicClient.waitForTransactionReceipt({ hash: tx });
  console.log("  → BURNER_ROLE granted");
} else {
  console.log("  → BURNER_ROLE already set, skipping");
}

const currentBalance = await publicClient.getBalance({ address: GATEWAY });
console.log(`Current gateway ETH balance: ${Number(currentBalance) / 1e18} ETH`);

if (currentBalance < SEED_ETH) {
  const toSend = SEED_ETH - currentBalance;
  const tx = await deployer.sendTransaction({ to: GATEWAY, value: toSend });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  console.log(`  → Seeded ${Number(toSend) / 1e18} ETH`);
} else {
  console.log("  → Already seeded, skipping");
}

console.log("Done.");
