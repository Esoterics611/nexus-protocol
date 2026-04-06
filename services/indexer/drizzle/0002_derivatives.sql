-- Phase 2: Derivatives tables for YieldSplitter and CreditVault events

CREATE TABLE IF NOT EXISTS split_positions (
  id SERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- split | unsplit | pt_redeemed | yt_redeemed
  vault_shares TEXT NOT NULL,
  pt_amount TEXT NOT NULL,
  yt_amount TEXT NOT NULL,
  splitter_address TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_split_user  ON split_positions (user_address);
CREATE INDEX idx_split_block ON split_positions (block_number);
CREATE INDEX idx_split_type  ON split_positions (event_type);
CREATE UNIQUE INDEX uniq_split_tx ON split_positions (tx_hash, event_type);

CREATE TABLE IF NOT EXISTS credit_positions (
  id SERIAL PRIMARY KEY,
  user_address TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- collateral_deposited | borrowed | repaid | collateral_withdrawn | liquidated
  collateral_shares TEXT NOT NULL,
  debt_nusd TEXT NOT NULL,
  liquidator TEXT,                 -- populated for liquidated events only
  credit_vault_address TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  indexed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_credit_user  ON credit_positions (user_address);
CREATE INDEX idx_credit_block ON credit_positions (block_number);
CREATE INDEX idx_credit_type  ON credit_positions (event_type);
CREATE UNIQUE INDEX uniq_credit_tx ON credit_positions (tx_hash, event_type, user_address);
