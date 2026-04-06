import { pgTable, serial, text, bigint, timestamp, integer, index, unique } from "drizzle-orm/pg-core";

// ── Indexed events ──────────────────────────────────────────────

/** All contract events, normalized into a common shape */
export const indexedEvents = pgTable(
  "indexed_events",
  {
    id: serial("id").primaryKey(),
    contractName: text("contract_name").notNull(),
    contractAddress: text("contract_address").notNull(),
    eventName: text("event_name").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    args: text("args").notNull(), // JSON-encoded event args
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_events_contract_event").on(t.contractName, t.eventName),
    index("idx_events_block").on(t.blockNumber),
    index("idx_events_tx").on(t.txHash),
    unique("uniq_event_log").on(t.txHash, t.logIndex),
  ],
);

// ── NAV history (denormalized for fast chart queries) ───────────

export const navHistory = pgTable(
  "nav_history",
  {
    id: serial("id").primaryKey(),
    vaultAddress: text("vault_address").notNull(),
    totalAssets: text("total_assets").notNull(), // stored as string for bigint safety
    reportedTimestamp: bigint("reported_timestamp", { mode: "bigint" }).notNull(),
    reporter: text("reporter").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_nav_vault").on(t.vaultAddress),
    index("idx_nav_timestamp").on(t.reportedTimestamp),
    unique("uniq_nav_tx").on(t.txHash),
  ],
);

// ── Vault transactions (deposits / withdrawals) ─────────────────

export const vaultTransactions = pgTable(
  "vault_transactions",
  {
    id: serial("id").primaryKey(),
    vaultAddress: text("vault_address").notNull(),
    txType: text("tx_type").notNull(), // "deposit" | "withdraw"
    sender: text("sender").notNull(),
    owner: text("owner").notNull(),
    assets: text("assets").notNull(),
    shares: text("shares").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "bigint" }),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_vault_tx_vault").on(t.vaultAddress),
    index("idx_vault_tx_owner").on(t.owner),
    index("idx_vault_tx_block").on(t.blockNumber),
    unique("uniq_vault_tx").on(t.txHash, t.txType),
  ],
);

// ── Stablecoin transfers ────────────────────────────────────────

export const stablecoinTransfers = pgTable(
  "stablecoin_transfers",
  {
    id: serial("id").primaryKey(),
    from: text("from_address").notNull(),
    to: text("to_address").notNull(),
    value: text("value").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "bigint" }),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_transfer_from").on(t.from),
    index("idx_transfer_to").on(t.to),
    index("idx_transfer_block").on(t.blockNumber),
    unique("uniq_transfer").on(t.txHash, t.from, t.to),
  ],
);

// ── Reserve updates ─────────────────────────────────────────────

export const reserveUpdates = pgTable(
  "reserve_updates",
  {
    id: serial("id").primaryKey(),
    assetType: text("asset_type").notNull(),
    amount: text("amount").notNull(),
    reporter: text("reporter").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "bigint" }),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_reserve_asset").on(t.assetType),
    index("idx_reserve_block").on(t.blockNumber),
    unique("uniq_reserve_tx").on(t.txHash, t.assetType),
  ],
);

// ── Indexer cursor (tracks last indexed block per source) ───────

export const indexerCursor = pgTable("indexer_cursor", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().unique(), // e.g. "stablecoin", "vault"
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Known vaults (populated from VaultFactory events) ──────────

export const knownVaults = pgTable("known_vaults", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
});

// ── Split positions (YieldSplitter Split / Unsplit events) ──────

export const splitPositions = pgTable(
  "split_positions",
  {
    id: serial("id").primaryKey(),
    user: text("user_address").notNull(),
    eventType: text("event_type").notNull(), // "split" | "unsplit" | "pt_redeemed" | "yt_redeemed"
    vaultShares: text("vault_shares").notNull(),
    ptAmount: text("pt_amount").notNull(),
    ytAmount: text("yt_amount").notNull(),
    splitterAddress: text("splitter_address").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "bigint" }),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_split_user").on(t.user),
    index("idx_split_block").on(t.blockNumber),
    index("idx_split_type").on(t.eventType),
    unique("uniq_split_tx").on(t.txHash, t.eventType),
  ],
);

// ── Credit positions (CreditVault borrow / repay / liquidation events) ──

export const creditPositions = pgTable(
  "credit_positions",
  {
    id: serial("id").primaryKey(),
    user: text("user_address").notNull(),
    eventType: text("event_type").notNull(), // "collateral_deposited" | "borrowed" | "repaid" | "collateral_withdrawn" | "liquidated"
    collateralShares: text("collateral_shares").notNull(),
    debtNusd: text("debt_nusd").notNull(),
    liquidator: text("liquidator"), // non-null only for "liquidated" events
    creditVaultAddress: text("credit_vault_address").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    txHash: text("tx_hash").notNull(),
    blockTimestamp: bigint("block_timestamp", { mode: "bigint" }),
    indexedAt: timestamp("indexed_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_credit_user").on(t.user),
    index("idx_credit_block").on(t.blockNumber),
    index("idx_credit_type").on(t.eventType),
    unique("uniq_credit_tx").on(t.txHash, t.eventType, t.user),
  ],
);
