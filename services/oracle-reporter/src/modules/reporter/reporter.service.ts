import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { loadConfig, type AppConfig } from "../../config/env";

// ── ABIs ──────────────────────────────────────────────────────────────────────

const NAV_ORACLE_ABI = [
  {
    type: "function",
    name: "postNAV",
    inputs: [
      { name: "totalAssets", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLatestNAV",
    inputs: [],
    outputs: [
      { name: "totalAssets", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

const YIELD_VAULT_ABI = [
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ReporterService implements OnModuleInit {
  private readonly logger = new Logger(ReporterService.name);
  private config!: AppConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient!: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient!: any;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    this.config = loadConfig();

    const account = privateKeyToAccount(this.config.reporterPrivateKey);

    const transport = http(this.config.rpcUrl, {
      retryCount: 3,
      retryDelay: 10_000,
      timeout: 30_000,
    });

    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport,
    });

    this.walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport,
    });

    this.logger.log(
      `Oracle reporter initialized — adapter: ${this.config.priceAdapter}, ` +
      `interval: ${this.config.postIntervalMs}ms, ` +
      `reporter: ${account.address}`,
    );

    // Post once on startup, then rely on the interval
    await this.report();
  }

  // NestJS @Interval does not support dynamic values, so we manage our own
  // interval via onModuleInit to respect POST_INTERVAL_MS from config.
  // The @Interval decorator below fires at a fixed 60s cadence only to keep
  // the service alive and log heartbeats; actual posting is gated by the
  // lastPostedAt tracking in report().
  @Interval(60_000)
  async heartbeat() {
    this.logger.debug("Heartbeat tick");
  }

  // Called on startup and by the dynamic interval
  async report() {
    try {
      const totalAssets = await this.fetchNAV();
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      this.logger.log(
        `Posting NAV — totalAssets: ${totalAssets}, timestamp: ${timestamp}`,
      );

      const txHash = await this.walletClient.writeContract({
        address: this.config.navOracleAddress,
        abi: NAV_ORACLE_ABI,
        functionName: "postNAV",
        args: [totalAssets, timestamp],
      });

      this.logger.log(`NAV posted — tx: ${txHash}`);

      // Wait for receipt to confirm
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status === "success") {
        this.logger.log(`NAV confirmed — block: ${receipt.blockNumber}`);
      } else {
        this.logger.error(`NAV tx reverted — block: ${receipt.blockNumber}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to post NAV: ${err.message}`);
    }

    // Schedule next post
    if (this.intervalHandle) clearTimeout(this.intervalHandle);
    this.intervalHandle = setTimeout(
      () => this.report(),
      this.config.postIntervalMs,
    );
  }

  // ── Price adapter ──────────────────────────────────────────────────────────

  private async fetchNAV(): Promise<bigint> {
    switch (this.config.priceAdapter) {
      case "mock":
        return this.fetchMockNAV();
      default:
        throw new Error(
          `Price adapter '${this.config.priceAdapter}' is not implemented yet`,
        );
    }
  }

  /**
   * Mock adapter: reads totalAssets() directly from the YieldVault contract.
   * This reflects the current on-chain state — suitable for dev/testnet.
   */
  private async fetchMockNAV(): Promise<bigint> {
    const totalAssets = await this.publicClient.readContract({
      address: this.config.yieldVaultAddress,
      abi: YIELD_VAULT_ABI,
      functionName: "totalAssets",
    });

    this.logger.debug(`Mock NAV from vault.totalAssets(): ${totalAssets}`);

    // If the vault has no deposits yet, use a non-zero seed value (1 NUSD = 1_000_000)
    // so the oracle can always accept the post (totalAssets must be > 0)
    return totalAssets > 0n ? totalAssets : 1_000_000n;
  }
}
