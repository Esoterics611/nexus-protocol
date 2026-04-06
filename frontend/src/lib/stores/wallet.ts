import { writable, derived, get } from "svelte/store";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  type WalletClient,
  type PublicClient,
} from "viem";
import { DEFAULT_CHAIN } from "$lib/contracts/addresses";

export const address = writable<`0x${string}` | null>(null);
export const connected = derived(address, ($a) => $a !== null);
export const walletClient = writable<WalletClient | null>(null);

const rpcUrl = import.meta.env.VITE_RPC_URL ?? DEFAULT_CHAIN.rpcUrl;

const viemChain = {
  id: DEFAULT_CHAIN.id,
  name: DEFAULT_CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
} as const;

// publicnode is reliable; keep short retry for transient network blips.
const rpcTransport = http(rpcUrl, {
  retryCount: 2,
  retryDelay: 1_000,
  timeout: 15_000,
});

export const publicClient: PublicClient = createPublicClient({
  chain: viemChain,
  transport: rpcTransport,
});

export async function connect() {
  if (typeof window === "undefined" || !window.ethereum) {
    alert("Please install MetaMask or another wallet");
    return;
  }
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as `0x${string}`[];
  if (!accounts[0]) return;

  address.set(accounts[0]);

  const wc = createWalletClient({
    account: accounts[0],
    chain: viemChain,
    transport: custom(window.ethereum),
  });
  walletClient.set(wc);
}

export function disconnect() {
  address.set(null);
  walletClient.set(null);
}

// Keep address in sync when MetaMask account/chain changes (client-side only)
if (typeof window !== "undefined" && window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts: string[]) => {
    if (!accounts.length) {
      disconnect();
      return;
    }
    const acc = accounts[0] as `0x${string}`;
    address.set(acc);
    const wc = createWalletClient({
      account: acc,
      chain: viemChain,
      transport: custom(window.ethereum!),
    });
    walletClient.set(wc);
  });

  window.ethereum.on("chainChanged", () => {
    // Reload on chain change — simplest safe approach
    window.location.reload();
  });
}

export function formatNUSD(value: bigint): string {
  return formatUnits(value, 6);
}

export function parseNUSD(value: string): bigint {
  return BigInt(Math.round(parseFloat(value) * 1e6));
}
