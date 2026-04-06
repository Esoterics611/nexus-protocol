export interface AppConfig {
  databaseUrl: string;
  rpcUrl: string;
  chainId: number;
  pollIntervalMs: number;
  startBlock: bigint;
  contracts: {
    stablecoin: `0x${string}`;
    mintController: `0x${string}`;
    navOracle: `0x${string}`;
    vaultFactory: `0x${string}`;
    yieldVault: `0x${string}`;
    reserveTracker: `0x${string}`;
    auditLog: `0x${string}`;
    restrictionList: `0x${string}`;
    kycRegistry: `0x${string}`;
    accreditedInvestor: `0x${string}`;
    transferRestrictions: `0x${string}`;
    // Phase 2 — derivatives
    yieldSplitter: `0x${string}`;
    creditVault: `0x${string}`;
  };
}

export function loadConfig(): AppConfig {
  const env = (key: string, fallback?: string): string => {
    const val = process.env[key] ?? fallback;
    if (!val) throw new Error(`Missing env var: ${key}`);
    return val;
  };

  const addr = (key: string) => env(key) as `0x${string}`;

  return {
    databaseUrl: env("DATABASE_URL"),
    rpcUrl: env("RPC_URL", "https://base-sepolia-rpc.publicnode.com"),
    chainId: parseInt(env("CHAIN_ID", "84532"), 10),
    pollIntervalMs: parseInt(env("POLL_INTERVAL_MS", "12000"), 10),
    startBlock: BigInt(env("START_BLOCK", "0")),
    contracts: {
      stablecoin: addr("STABLECOIN_ADDRESS"),
      mintController: addr("MINT_CONTROLLER_ADDRESS"),
      navOracle: addr("NAV_ORACLE_ADDRESS"),
      vaultFactory: addr("VAULT_FACTORY_ADDRESS"),
      yieldVault: addr("YIELD_VAULT_ADDRESS"),
      reserveTracker: addr("RESERVE_TRACKER_ADDRESS"),
      auditLog: addr("AUDIT_LOG_ADDRESS"),
      restrictionList: addr("RESTRICTION_LIST_ADDRESS"),
      kycRegistry: addr("KYC_REGISTRY_ADDRESS"),
      accreditedInvestor: addr("ACCREDITED_INVESTOR_ADDRESS"),
      transferRestrictions: addr("TRANSFER_RESTRICTIONS_ADDRESS"),
      // Phase 2 — derivatives
      yieldSplitter: addr("YIELD_SPLITTER_ADDRESS"),
      creditVault: addr("CREDIT_VAULT_ADDRESS"),
    },
  };
}
