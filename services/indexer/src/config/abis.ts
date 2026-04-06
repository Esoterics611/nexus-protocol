/** Minimal ABIs — only the events we index */

export const STABLECOIN_EVENTS = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Paused",
    inputs: [{ name: "account", type: "address", indexed: false }],
  },
  {
    type: "event",
    name: "Unpaused",
    inputs: [{ name: "account", type: "address", indexed: false }],
  },
] as const;

export const NAV_ORACLE_EVENTS = [
  {
    type: "event",
    name: "NAVUpdated",
    inputs: [
      { name: "totalAssets", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "reporter", type: "address", indexed: true },
    ],
  },
] as const;

export const YIELD_VAULT_EVENTS = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
] as const;

export const RESERVE_TRACKER_EVENTS = [
  {
    type: "event",
    name: "ReserveUpdated",
    inputs: [
      { name: "assetType", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "reporter", type: "address", indexed: true },
    ],
  },
] as const;

export const VAULT_FACTORY_EVENTS = [
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { name: "vault", type: "address", indexed: true },
      { name: "depositToken", type: "address", indexed: true },
      { name: "oracle", type: "address", indexed: true },
    ],
  },
] as const;

export const RESTRICTION_LIST_EVENTS = [
  {
    type: "event",
    name: "AddressRestricted",
    inputs: [{ name: "account", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "AddressUnrestricted",
    inputs: [{ name: "account", type: "address", indexed: true }],
  },
] as const;

export const KYC_REGISTRY_EVENTS = [
  {
    type: "event",
    name: "KYCVerified",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "expiry", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "KYCRevoked",
    inputs: [{ name: "account", type: "address", indexed: true }],
  },
] as const;

export const AUDIT_LOG_EVENTS = [
  {
    type: "event",
    name: "AuditEntry",
    inputs: [
      { name: "entryId", type: "uint256", indexed: true },
      { name: "category", type: "string", indexed: false },
      { name: "message", type: "string", indexed: false },
      { name: "data", type: "bytes", indexed: false },
      { name: "logger", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const YIELD_SPLITTER_EVENTS = [
  {
    type: "event",
    name: "Split",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "vaultShares", type: "uint256", indexed: false },
      { name: "ptAmount", type: "uint256", indexed: false },
      { name: "ytAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Unsplit",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ptAmount", type: "uint256", indexed: false },
      { name: "vaultShares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "YieldDistributed",
    inputs: [
      { name: "yieldAmount", type: "uint256", indexed: false },
      { name: "navBefore", type: "uint256", indexed: false },
      { name: "navAfter", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PTRedeemed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ptAmount", type: "uint256", indexed: false },
      { name: "assets", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "YTRedeemed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "ytAmount", type: "uint256", indexed: false },
      { name: "yieldAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const CREDIT_VAULT_EVENTS = [
  {
    type: "event",
    name: "CollateralDeposited",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Borrowed",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "nusdAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "nusdAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CollateralWithdrawn",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "borrower", type: "address", indexed: true },
      { name: "liquidator", type: "address", indexed: true },
      { name: "collateralSeized", type: "uint256", indexed: false },
      { name: "debtRepaid", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "LiquidityFunded",
    inputs: [
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
