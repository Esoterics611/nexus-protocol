// scripts/setPrice.ts — update MockPriceFeed price (UPDATER_ROLE required)
import hre from "hardhat";

const PRICE_FEED = "0xf6752cf9665db80a396073c66ac8df4b4b5327be" as const;

// Current ETH/USD: $2180 (8 decimals)
const NEW_PRICE = 218_000_000_000n; // 2180 * 1e8

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();

const feed = await viem.getContractAt("MockPriceFeed", PRICE_FEED);
const oldPrice = await feed.read.latestAnswer();
console.log(`Old price: $${Number(oldPrice) / 1e8}`);

const tx = await feed.write.setPrice([NEW_PRICE]);
await publicClient.waitForTransactionReceipt({ hash: tx });

const newPrice = await feed.read.latestAnswer();
console.log(`New price: $${Number(newPrice) / 1e8}`);
