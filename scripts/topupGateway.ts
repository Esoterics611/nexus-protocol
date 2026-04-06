// scripts/topupGateway.ts — send ETH to gateway reserves from deployer wallet
import hre from "hardhat";
import { parseEther, formatEther } from "viem";

const GATEWAY = "0xd4ffdd233197a0d24be3cd882c8a6145ffe5f57b" as const;
const TOPUP_AMOUNT = parseEther("0.5"); // $1,400 worth at $2800 — enough for demo sells

const connection = await hre.network.connect();
const viem = connection.viem;
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const before = await publicClient.getBalance({ address: GATEWAY });
console.log(`Gateway balance before: ${formatEther(before)} ETH`);

const tx = await deployer.sendTransaction({ to: GATEWAY, value: TOPUP_AMOUNT });
await publicClient.waitForTransactionReceipt({ hash: tx });

const after = await publicClient.getBalance({ address: GATEWAY });
console.log(`Gateway balance after:  ${formatEther(after)} ETH`);
console.log(`Topped up by ${formatEther(TOPUP_AMOUNT)} ETH — supports ~$${(Number(TOPUP_AMOUNT) / 1e18 * 2800).toLocaleString()} in NUSD redemptions`);
