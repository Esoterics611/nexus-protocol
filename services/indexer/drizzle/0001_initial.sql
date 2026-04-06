-- Initial schema for Nexus Protocol event indexer

CREATE TABLE IF NOT EXISTS indexed_events (
  id SERIAL PRIMARY KEY,
  contract_name TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  args TEXT NOT NULL,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_events_contract_event ON indexed_events (contract_name, event_name);
CREATE INDEX idx_events_block ON indexed_events (block_number);
CREATE INDEX idx_events_tx ON indexed_events (tx_hash);
CREATE UNIQUE INDEX uniq_event_log ON indexed_events (tx_hash, log_index);

CREATE TABLE IF NOT EXISTS nav_history (
  id SERIAL PRIMARY KEY,
  vault_address TEXT NOT NULL,
  total_assets TEXT NOT NULL,
  reported_timestamp BIGINT NOT NULL,
  reporter TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_nav_vault ON nav_history (vault_address);
CREATE INDEX idx_nav_timestamp ON nav_history (reported_timestamp);
CREATE UNIQUE INDEX uniq_nav_tx ON nav_history (tx_hash);

CREATE TABLE IF NOT EXISTS vault_transactions (
  id SERIAL PRIMARY KEY,
  vault_address TEXT NOT NULL,
  tx_type TEXT NOT NULL,
  sender TEXT NOT NULL,
  owner TEXT NOT NULL,
  assets TEXT NOT NULL,
  shares TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_vault_tx_vault ON vault_transactions (vault_address);
CREATE INDEX idx_vault_tx_owner ON vault_transactions (owner);
CREATE INDEX idx_vault_tx_block ON vault_transactions (block_number);
CREATE UNIQUE INDEX uniq_vault_tx ON vault_transactions (tx_hash, tx_type);

CREATE TABLE IF NOT EXISTS stablecoin_transfers (
  id SERIAL PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  value TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_transfer_from ON stablecoin_transfers (from_address);
CREATE INDEX idx_transfer_to ON stablecoin_transfers (to_address);
CREATE INDEX idx_transfer_block ON stablecoin_transfers (block_number);
CREATE UNIQUE INDEX uniq_transfer ON stablecoin_transfers (tx_hash, from_address, to_address);

CREATE TABLE IF NOT EXISTS reserve_updates (
  id SERIAL PRIMARY KEY,
  asset_type TEXT NOT NULL,
  amount TEXT NOT NULL,
  reporter TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_reserve_asset ON reserve_updates (asset_type);
CREATE INDEX idx_reserve_block ON reserve_updates (block_number);
CREATE UNIQUE INDEX uniq_reserve_tx ON reserve_updates (tx_hash, asset_type);

CREATE TABLE IF NOT EXISTS known_vaults (
  id SERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS indexer_cursor (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL UNIQUE,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
