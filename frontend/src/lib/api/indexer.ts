// Client for the Nexus Indexer REST API
// Set VITE_INDEXER_URL in .env to point at your indexer service

const BASE_URL = (import.meta.env.VITE_INDEXER_URL ?? "http://localhost:3001") as string;

// Tracks whether the indexer responded on the last attempt.
// Pages use this to skip polling when the service is known-offline.
export let indexerOnline = false;

async function get<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  try {
    const url = new URL(`${BASE_URL}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString());
    if (!res.ok) { indexerOnline = false; return null; }
    indexerOnline = true;
    return res.json() as Promise<T>;
  } catch {
    indexerOnline = false;
    return null;
  }
}

// ── Types ──────────────────────────────────────────────────────

export interface NavHistoryEntry {
  id: number;
  vaultAddress: string;
  totalAssets: string; // bigint as string
  reportedTimestamp: string;
  reporter: string;
  blockNumber: string;
  txHash: string;
  indexedAt: string;
}

export interface VaultTransaction {
  id: number;
  vaultAddress: string;
  txType: "deposit" | "withdraw";
  sender: string;
  owner: string;
  assets: string;
  shares: string;
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}

export interface StablecoinTransfer {
  id: number;
  from: string;
  to: string;
  value: string;
  blockNumber: string;
  txHash: string;
  blockTimestamp: string | null;
  indexedAt: string;
}

export interface IndexerStatus {
  cursors: { source: string; lastBlock: string; updatedAt: string }[];
  vaults: { address: string; registeredAt: string }[];
}

// ── API calls ──────────────────────────────────────────────────

export async function getNavHistory(vault?: string, limit = 100): Promise<NavHistoryEntry[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (vault) params.vault = vault;
  return (await get<NavHistoryEntry[]>("/api/nav-history", params)) ?? [];
}

export async function getVaultTransactions(
  opts: { vault?: string; owner?: string; limit?: number } = {},
): Promise<VaultTransaction[]> {
  const params: Record<string, string> = { limit: String(opts.limit ?? 50) };
  if (opts.vault) params.vault = opts.vault;
  if (opts.owner) params.owner = opts.owner;
  return (await get<VaultTransaction[]>("/api/vault-transactions", params)) ?? [];
}

export async function getTransfers(address?: string, limit = 50): Promise<StablecoinTransfer[]> {
  const params: Record<string, string> = { limit: String(limit) };
  if (address) params.address = address;
  return (await get<StablecoinTransfer[]>("/api/transfers", params)) ?? [];
}

export async function getIndexerStatus(): Promise<IndexerStatus | null> {
  return get<IndexerStatus>("/api/indexer-status");
}

// ── Helpers ────────────────────────────────────────────────────

/** Format a block timestamp (seconds since epoch) as a readable date */
export function fmtTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Format a bigint string as USD with 6 decimals (NUSD convention) */
export function fmtAssetStr(v: string): string {
  return "$" + (Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 });
}
