// Contract addresses per chain — populated after deployment
import deployments from "./deployments.json";

type ContractAddresses = {
  stablecoin: `0x${string}`;
  mintController: `0x${string}`;
  yieldVault: `0x${string}`;
  navOracle: `0x${string}`;
  restrictionList: `0x${string}`;
  kycRegistry: `0x${string}`;
  accreditedInvestor: `0x${string}`;
  transferRestrictions: `0x${string}`;
  reserveTracker: `0x${string}`;
  auditLog: `0x${string}`;
  vaultFactory: `0x${string}`;
  priceFeed: `0x${string}`;
  swapGateway: `0x${string}`;
  // Phase 2: Derivatives
  principalToken: `0x${string}`;
  yieldToken: `0x${string}`;
  yieldSplitter: `0x${string}`;
  creditVault: `0x${string}`;
  etfWrapper: `0x${string}`;
};

export const CHAINS = {
  baseSepolia: {
    id: 84532,
    name: "Base Sepolia",
    // publicnode for large-contract deploys; drpc for reads (both point to same chain)
    rpcUrl: "https://base-sepolia-rpc.publicnode.com",
    blockExplorer: "https://sepolia.basescan.org",
    contracts: deployments as ContractAddresses,
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

// Always Base Sepolia — no local chain wiring
export const DEFAULT_CHAIN = CHAINS.baseSepolia;
