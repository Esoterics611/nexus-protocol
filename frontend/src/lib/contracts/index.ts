import { getContract, type PublicClient, type WalletClient } from "viem";
import {
  STABLECOIN_ABI,
  YIELD_VAULT_ABI,
  NAV_ORACLE_ABI,
  MINT_CONTROLLER_ABI,
  RESTRICTION_LIST_ABI,
  KYC_REGISTRY_ABI,
  ACCREDITED_INVESTOR_ABI,
  RESERVE_TRACKER_ABI,
  VAULT_FACTORY_ABI,
  SWAP_GATEWAY_ABI,
  PRINCIPAL_TOKEN_ABI,
  YIELD_TOKEN_ABI,
  YIELD_SPLITTER_ABI,
  CREDIT_VAULT_ABI,
  ETF_WRAPPER_ABI,
} from "./abis";
import { DEFAULT_CHAIN } from "./addresses";

type AnyClient = PublicClient | WalletClient;

const addr = DEFAULT_CHAIN.contracts;

export function getAddresses() {
  return addr;
}

export function getStablecoin(client: AnyClient) {
  return getContract({ address: addr.stablecoin, abi: STABLECOIN_ABI, client });
}

export function getVaultFactory(client: AnyClient) {
  return getContract({ address: addr.vaultFactory, abi: VAULT_FACTORY_ABI, client });
}

export function getVault(address: `0x${string}`, client: AnyClient) {
  return getContract({ address, abi: YIELD_VAULT_ABI, client });
}

export function getNAVOracle(client: AnyClient) {
  return getContract({ address: addr.navOracle, abi: NAV_ORACLE_ABI, client });
}

export function getMintController(client: AnyClient) {
  return getContract({ address: addr.mintController, abi: MINT_CONTROLLER_ABI, client });
}

export function getRestrictionList(client: AnyClient) {
  return getContract({ address: addr.restrictionList, abi: RESTRICTION_LIST_ABI, client });
}

export function getKYCRegistry(client: AnyClient) {
  return getContract({ address: addr.kycRegistry, abi: KYC_REGISTRY_ABI, client });
}

export function getAccreditedInvestor(client: AnyClient) {
  return getContract({ address: addr.accreditedInvestor, abi: ACCREDITED_INVESTOR_ABI, client });
}

export function getReserveTracker(client: AnyClient) {
  return getContract({ address: addr.reserveTracker, abi: RESERVE_TRACKER_ABI, client });
}

export function getSwapGateway(client: AnyClient) {
  return getContract({ address: addr.swapGateway, abi: SWAP_GATEWAY_ABI, client });
}

export function isGatewayDeployed(): boolean {
  return addr.swapGateway !== "0x0000000000000000000000000000000000000000";
}

// Phase 2: Derivatives
export function getPrincipalToken(client: AnyClient) {
  return getContract({ address: addr.principalToken, abi: PRINCIPAL_TOKEN_ABI, client });
}

export function getYieldToken(client: AnyClient) {
  return getContract({ address: addr.yieldToken, abi: YIELD_TOKEN_ABI, client });
}

export function getYieldSplitter(client: AnyClient) {
  return getContract({ address: addr.yieldSplitter, abi: YIELD_SPLITTER_ABI, client });
}

export function getCreditVault(client: AnyClient) {
  return getContract({ address: addr.creditVault, abi: CREDIT_VAULT_ABI, client });
}

export function getETFWrapper(client: AnyClient) {
  return getContract({ address: addr.etfWrapper, abi: ETF_WRAPPER_ABI, client });
}
