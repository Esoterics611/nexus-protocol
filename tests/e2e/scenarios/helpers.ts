/**
 * Shared test helpers used across scenarios.
 * Handles wallet bridge setup (exposeFunction) separately from the fixture
 * so scenario 01 can use raw `page` instead of walletPage.
 */

import { type Page, expect } from '@playwright/test';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { type TestWallet, RPC_URL } from '../wallets/index.js';

/**
 * Exposes __nexusWalletRequest on the page for the given wallet.
 * Call this before addInitScript + page.goto.
 */
export async function setupWalletBridge(page: Page, wallet: TestWallet) {
  const account = privateKeyToAccount(wallet.privateKey);
  const rpcClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

  await page.exposeFunction(
    '__nexusWalletRequest',
    async (method: string, params: any[]): Promise<any> => {
      if (method === 'eth_sendTransaction') {
        const txParams = params[0];
        const [nonce, fees] = await Promise.all([
          rpcClient.getTransactionCount({ address: account.address }),
          rpcClient.estimateFeesPerGas(),
        ]);
        let gas = 300_000n;
        try {
          gas = await rpcClient.estimateGas({
            account: account.address,
            to: txParams.to,
            data: txParams.data || '0x',
            value: txParams.value ? BigInt(txParams.value) : undefined,
          });
          gas = gas + 30_000n;
        } catch { /* use default */ }

        const signedTx = await account.signTransaction({
          chainId: baseSepolia.id,
          type: 'eip1559',
          nonce,
          to: txParams.to as `0x${string}`,
          data: (txParams.data || '0x') as `0x${string}`,
          value: txParams.value ? BigInt(txParams.value) : 0n,
          gas,
          maxFeePerGas: fees.maxFeePerGas!,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas!,
        });

        const txHash = await rpcClient.request({
          method: 'eth_sendRawTransaction',
          params: [signedTx],
        }) as Hash;

        console.log(`    tx[${wallet.role}]: ${txHash}`);

        const receipt = await rpcClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
        if (receipt.status === 'reverted') throw new Error(`Reverted: ${txHash}`);
        return txHash;
      }

      if (method === 'personal_sign') {
        return account.signMessage({ message: { raw: params[0] as `0x${string}` } });
      }

      return rpcClient.request({ method: method as any, params: params as any });
    }
  );
}

/** Polls indexer until predicate returns true. Returns the response data. */
export async function waitForIndexer(
  page: Page,
  path: string,
  predicate: (data: any) => boolean,
  timeoutMs = 90_000,
): Promise<any> {
  let result: any;
  await expect.poll(async () => {
    try {
      const res = await page.request.get(`http://localhost:3001${path}`);
      if (!res.ok()) return false;
      result = await res.json();
      return predicate(result);
    } catch { return false; }
  }, { timeout: timeoutMs, intervals: [5_000, 8_000, 12_000] }).toBeTruthy();
  return result;
}
