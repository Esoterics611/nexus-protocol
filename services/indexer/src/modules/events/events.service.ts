import { Injectable, Logger, OnModuleInit, Inject } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import {
  createPublicClient,
  http,
  parseEventLogs,
} from "viem";
import { baseSepolia } from "viem/chains";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { DB_TOKEN } from "../../common/database.module";
import { loadConfig, type AppConfig } from "../../config/env";
import {
  indexedEvents,
  navHistory,
  vaultTransactions,
  stablecoinTransfers,
  reserveUpdates,
  indexerCursor,
  knownVaults,
  splitPositions,
  creditPositions,
} from "../../config/database";
import {
  STABLECOIN_EVENTS,
  NAV_ORACLE_EVENTS,
  YIELD_VAULT_EVENTS,
  RESERVE_TRACKER_EVENTS,
  VAULT_FACTORY_EVENTS,
  RESTRICTION_LIST_EVENTS,
  KYC_REGISTRY_EVENTS,
  AUDIT_LOG_EVENTS,
  YIELD_SPLITTER_EVENTS,
  CREDIT_VAULT_EVENTS,
} from "../../config/abis";

interface EventSource {
  name: string;
  address: `0x${string}`;
  abi: readonly any[];
}

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  // viem's createPublicClient with baseSepolia returns a deep OP-Stack generic
  // that doesn't round-trip cleanly through ReturnType<>. Any is fine here —
  // this field is private and only used by the methods in this class.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client!: any;
  private config!: AppConfig;
  private baseSources: EventSource[] = [];
  private polling = false;

  constructor(@Inject(DB_TOKEN) private readonly db: PostgresJsDatabase) {}

  async onModuleInit() {
    this.config = loadConfig();

    this.client = createPublicClient({
      chain: baseSepolia,
      transport: http(this.config.rpcUrl, {
        retryCount: 3,
        retryDelay: 10_000,
        timeout: 30_000,
      }),
    });

    this.baseSources = [
      { name: "stablecoin", address: this.config.contracts.stablecoin, abi: STABLECOIN_EVENTS },
      { name: "navOracle", address: this.config.contracts.navOracle, abi: NAV_ORACLE_EVENTS },
      { name: "reserveTracker", address: this.config.contracts.reserveTracker, abi: RESERVE_TRACKER_EVENTS },
      { name: "vaultFactory", address: this.config.contracts.vaultFactory, abi: VAULT_FACTORY_EVENTS },
      { name: "restrictionList", address: this.config.contracts.restrictionList, abi: RESTRICTION_LIST_EVENTS },
      { name: "kycRegistry", address: this.config.contracts.kycRegistry, abi: KYC_REGISTRY_EVENTS },
      { name: "auditLog", address: this.config.contracts.auditLog, abi: AUDIT_LOG_EVENTS },
      // Phase 2 — derivatives
      { name: "yieldSplitter", address: this.config.contracts.yieldSplitter, abi: YIELD_SPLITTER_EVENTS },
      { name: "creditVault", address: this.config.contracts.creditVault, abi: CREDIT_VAULT_EVENTS },
    ];

    // Seed initial vault if configured
    await this.ensureVaultKnown(this.config.contracts.yieldVault);

    this.logger.log(`Indexer initialized — RPC: ${this.config.rpcUrl}`);
    await this.poll();
  }

  @Interval(12_000)
  async poll() {
    if (this.polling) return;
    this.polling = true;

    try {
      const currentBlock = await this.client.getBlockNumber();
      const sources = [...this.baseSources, ...(await this.vaultSources())];

      for (const source of sources) {
        await this.indexSource(source, currentBlock);
      }
    } catch (err: any) {
      this.logger.error(`Poll failed: ${err.message}`);
    } finally {
      this.polling = false;
    }
  }

  // ── Vault registry ──────────────────────────────────────────────────────────

  private async vaultSources(): Promise<EventSource[]> {
    const vaults = await this.db.select().from(knownVaults);
    return vaults.map((v) => ({
      name: `vault:${v.address}`,
      address: v.address as `0x${string}`,
      abi: YIELD_VAULT_EVENTS,
    }));
  }

  private async ensureVaultKnown(address: `0x${string}`) {
    const existing = await this.db
      .select()
      .from(knownVaults)
      .where(eq(knownVaults.address, address))
      .limit(1);
    if (existing.length === 0) {
      await this.db.insert(knownVaults).values({ address });
      this.logger.log(`Registered vault: ${address}`);
    }
  }

  // ── Block fetching ──────────────────────────────────────────────────────────

  private blockTimestampCache = new Map<bigint, bigint>();

  private async getBlockTimestamp(blockNumber: bigint): Promise<bigint> {
    if (this.blockTimestampCache.has(blockNumber)) {
      return this.blockTimestampCache.get(blockNumber)!;
    }
    const block = await this.client.getBlock({ blockNumber });
    this.blockTimestampCache.set(blockNumber, block.timestamp);
    // Keep cache bounded
    if (this.blockTimestampCache.size > 500) {
      const oldest = [...this.blockTimestampCache.keys()][0];
      this.blockTimestampCache.delete(oldest);
    }
    return block.timestamp;
  }

  // ── Indexing logic ──────────────────────────────────────────────────────────

  private async indexSource(source: EventSource, currentBlock: bigint) {
    const fromBlock = await this.getLastBlock(source.name);
    if (fromBlock >= currentBlock) return;

    const CHUNK = 10_000n;
    let start = fromBlock + 1n;

    while (start <= currentBlock) {
      const end = start + CHUNK - 1n > currentBlock ? currentBlock : start + CHUNK - 1n;

      const logs = await this.client.getLogs({
        address: source.address,
        fromBlock: start,
        toBlock: end,
      });

      if (logs.length > 0) {
        const parsed = parseEventLogs({ abi: source.abi as any, logs });
        if (parsed.length > 0) {
          await this.processLogs(source, parsed);
          this.logger.log(`${source.name}: +${parsed.length} events (${start}-${end})`);
        }
      }

      start = end + 1n;
    }

    await this.updateCursor(source.name, currentBlock);
  }

  // parsed events from viem's parseEventLogs carry all original log fields
  // (blockNumber, transactionHash, logIndex) — no need to zip with rawLogs
  private async processLogs(source: EventSource, parsed: any[]) {
    for (const event of parsed) {
      await this.db
        .insert(indexedEvents)
        .values({
          contractName: source.name,
          contractAddress: source.address,
          eventName: event.eventName,
          blockNumber: event.blockNumber!,
          txHash: event.transactionHash!,
          logIndex: event.logIndex!,
          args: JSON.stringify(event.args, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v,
          ),
        })
        .onConflictDoNothing();

      await this.processDenormalized(source, event);
    }
  }

  private async processDenormalized(source: EventSource, event: any) {
    const args = event.args;
    const blockNum = event.blockNumber!;

    const txHash = event.transactionHash!;

    switch (event.eventName) {
      case "NAVUpdated": {
        // NAV oracle is shared; source.address is the oracle — look up which vault uses it.
        // For now the oracle is 1:1 with the seeded vault; VaultCreated events will expand this.
        // We store the NAV against all known vaults that reference this oracle.
        const vaults = await this.db.select().from(knownVaults);
        const targetVault = vaults.length > 0
          ? vaults[0].address  // single-vault setup; extend when multi-oracle support lands
          : this.config.contracts.yieldVault;

        await this.db
          .insert(navHistory)
          .values({
            vaultAddress: targetVault,
            totalAssets: args.totalAssets.toString(),
            reportedTimestamp: args.timestamp,
            reporter: args.reporter,
            blockNumber: blockNum,
            txHash,
          })
          .onConflictDoNothing();
        break;
      }

      case "Deposit": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(vaultTransactions)
          .values({
            vaultAddress: source.address,
            txType: "deposit",
            sender: args.sender,
            owner: args.owner,
            assets: args.assets.toString(),
            shares: args.shares.toString(),
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Withdraw": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(vaultTransactions)
          .values({
            vaultAddress: source.address,
            txType: "withdraw",
            sender: args.sender,
            owner: args.receiver,
            assets: args.assets.toString(),
            shares: args.shares.toString(),
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Transfer": {
        if (source.name === "stablecoin") {
          const ts = await this.getBlockTimestamp(blockNum);
          await this.db
            .insert(stablecoinTransfers)
            .values({
              from: args.from,
              to: args.to,
              value: args.value.toString(),
              blockNumber: blockNum,
              txHash,
              blockTimestamp: ts,
            })
            .onConflictDoNothing();
        }
        break;
      }

      case "ReserveUpdated": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(reserveUpdates)
          .values({
            assetType: args.assetType,
            amount: args.amount.toString(),
            reporter: args.reporter,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "VaultCreated": {
        // Dynamically register newly deployed vaults
        await this.ensureVaultKnown(args.vault as `0x${string}`);
        break;
      }

      // ── YieldSplitter events ──────────────────────────────────────────────

      case "Split": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(splitPositions)
          .values({
            user: args.user,
            eventType: "split",
            vaultShares: args.vaultShares.toString(),
            ptAmount: args.ptAmount.toString(),
            ytAmount: args.ytAmount.toString(),
            splitterAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Unsplit": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(splitPositions)
          .values({
            user: args.user,
            eventType: "unsplit",
            vaultShares: args.vaultShares.toString(),
            ptAmount: args.ptAmount.toString(),
            ytAmount: "0",
            splitterAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "PTRedeemed": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(splitPositions)
          .values({
            user: args.user,
            eventType: "pt_redeemed",
            vaultShares: args.assets.toString(),
            ptAmount: args.ptAmount.toString(),
            ytAmount: "0",
            splitterAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "YTRedeemed": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(splitPositions)
          .values({
            user: args.user,
            eventType: "yt_redeemed",
            vaultShares: args.yieldAmount.toString(),
            ptAmount: "0",
            ytAmount: args.ytAmount.toString(),
            splitterAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      // ── CreditVault events ────────────────────────────────────────────────

      case "CollateralDeposited": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(creditPositions)
          .values({
            user: args.user,
            eventType: "collateral_deposited",
            collateralShares: args.shares.toString(),
            debtNusd: "0",
            creditVaultAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Borrowed": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(creditPositions)
          .values({
            user: args.user,
            eventType: "borrowed",
            collateralShares: "0",
            debtNusd: args.nusdAmount.toString(),
            creditVaultAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Repaid": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(creditPositions)
          .values({
            user: args.user,
            eventType: "repaid",
            collateralShares: "0",
            debtNusd: args.nusdAmount.toString(),
            creditVaultAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "CollateralWithdrawn": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(creditPositions)
          .values({
            user: args.user,
            eventType: "collateral_withdrawn",
            collateralShares: args.shares.toString(),
            debtNusd: "0",
            creditVaultAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }

      case "Liquidated": {
        const ts = await this.getBlockTimestamp(blockNum);
        await this.db
          .insert(creditPositions)
          .values({
            user: args.borrower,
            eventType: "liquidated",
            collateralShares: args.collateralSeized.toString(),
            debtNusd: args.debtRepaid.toString(),
            liquidator: args.liquidator,
            creditVaultAddress: source.address,
            blockNumber: blockNum,
            txHash,
            blockTimestamp: ts,
          })
          .onConflictDoNothing();
        break;
      }
    }
  }

  // ── Cursor management ───────────────────────────────────────────────────────

  private async getLastBlock(source: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(indexerCursor)
      .where(eq(indexerCursor.source, source))
      .limit(1);
    return rows.length > 0 ? rows[0].lastBlock : this.config.startBlock;
  }

  private async updateCursor(source: string, block: bigint) {
    const existing = await this.db
      .select()
      .from(indexerCursor)
      .where(eq(indexerCursor.source, source))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(indexerCursor)
        .set({ lastBlock: block, updatedAt: new Date() })
        .where(eq(indexerCursor.source, source));
    } else {
      await this.db.insert(indexerCursor).values({ source, lastBlock: block });
    }
  }
}
