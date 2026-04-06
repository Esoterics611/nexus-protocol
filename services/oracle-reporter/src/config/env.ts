export interface AppConfig {
  rpcUrl: string;
  chainId: number;
  reporterPrivateKey: `0x${string}`;
  navOracleAddress: `0x${string}`;
  yieldVaultAddress: `0x${string}`;
  priceAdapter: "mock" | "bloomberg" | "refinitiv";
  postIntervalMs: number;
}

export function loadConfig(): AppConfig {
  const env = (key: string, fallback?: string): string => {
    const val = process.env[key] ?? fallback;
    if (!val) throw new Error(`Missing env var: ${key}`);
    return val;
  };

  const addr = (key: string) => env(key) as `0x${string}`;

  const adapter = env("PRICE_ADAPTER", "mock");
  if (adapter !== "mock" && adapter !== "bloomberg" && adapter !== "refinitiv") {
    throw new Error(`Invalid PRICE_ADAPTER: ${adapter}. Must be mock | bloomberg | refinitiv`);
  }

  return {
    rpcUrl: env("RPC_URL", "https://base-sepolia.drpc.org"),
    chainId: parseInt(env("CHAIN_ID", "84532"), 10),
    reporterPrivateKey: addr("REPORTER_PRIVATE_KEY"),
    navOracleAddress: addr("NAV_ORACLE_ADDRESS"),
    yieldVaultAddress: addr("YIELD_VAULT_ADDRESS"),
    priceAdapter: adapter,
    postIntervalMs: parseInt(env("POST_INTERVAL_MS", "86400000"), 10),
  };
}
