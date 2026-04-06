/**
 * Playwright fixture that injects a test wallet into the browser.
 *
 * Usage in tests:
 *   import { test } from '../fixtures/wallet-fixture.js';
 *   test('my test', async ({ walletPage }) => {
 *     await walletPage.connect();
 *     await walletPage.goto('/vaults/0x...');
 *   });
 */

import { test as base, expect, type Page } from '@playwright/test';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseGwei,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { wallets, RPC_URL, type TestWallet, type WalletRole, assertWalletsConfigured } from '../wallets/index.js';
import { getInjectionScript } from '../inject/ethereum-provider.js';

// ── Viem clients (shared, created once per worker) ────────────────────────────

const transport = http(RPC_URL);

// ── WalletPage: extended Page with wallet helpers ─────────────────────────────

export class WalletPage {
  constructor(
    public readonly page: Page,
    public readonly wallet: TestWallet,
  ) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async goto(path: string) {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  // ── Wallet connection ────────────────────────────────────────────────────────

  /**
   * Clicks "[ CONNECT WALLET ]" and waits for address to appear in header.
   */
  async connect() {
    await this.page.getByRole('button', { name: '[ CONNECT WALLET ]' }).click();
    // Wait for address to appear in the button (0x1234...5678 format)
    await expect(
      this.page.locator('button.wallet-btn.connected')
    ).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Navigate to a page and connect wallet in one call.
   */
  async gotoConnected(path: string) {
    await this.goto(path);
    await this.connect();
  }

  // ── Transaction helpers ─────────────────────────────────────────────────────

  /**
   * Waits for a success state after a TxButton click.
   * Expects no error toast to appear within 5s.
   */
  async expectSuccess() {
    // If an error toast appears, the test fails
    const errorToast = this.page.locator('[class*="toast"][class*="error"], .toast.error');
    await expect(errorToast).not.toBeVisible({ timeout: 5_000 });
  }

  /**
   * Expects a revert — an error toast containing the given substring.
   */
  async expectRevert(messageSubstring: string) {
    const toast = this.page.locator('[class*="toast"]');
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await expect(toast).toContainText(messageSubstring, { ignoreCase: true });
  }

  // ── Form helpers ─────────────────────────────────────────────────────────────

  async fillInput(labelOrPlaceholder: string, value: string) {
    // Try by placeholder first, then by label
    const byPlaceholder = this.page.getByPlaceholder(labelOrPlaceholder);
    if (await byPlaceholder.count() > 0) {
      await byPlaceholder.fill(value);
    } else {
      await this.page.getByLabel(labelOrPlaceholder).fill(value);
    }
  }

  // ── Indexer polling helper ───────────────────────────────────────────────────

  /**
   * Polls the indexer API until the predicate returns true.
   * Useful for asserting on-chain state was indexed.
   */
  async waitForIndexer(
    endpoint: string,
    predicate: (data: any) => boolean,
    timeoutMs = 90_000,
  ): Promise<any> {
    const baseUrl = 'http://localhost:3001';
    let data: any = null;
    await expect.poll(async () => {
      try {
        const res = await this.page.request.get(`${baseUrl}${endpoint}`);
        if (!res.ok()) return false;
        data = await res.json();
        return predicate(data);
      } catch {
        return false;
      }
    }, { timeout: timeoutMs, intervals: [3000, 5000, 8000, 12000] }).toBeTruthy();
    return data;
  }
}

// ── Fixture definition ────────────────────────────────────────────────────────

type WalletFixtures = {
  /** Pre-configured page for wallet[2] (investor-a) by default */
  walletPage: WalletPage;
  /** Factory: get a WalletPage for any wallet role */
  walletFor: (role: WalletRole) => Promise<WalletPage>;
};

export const test = base.extend<WalletFixtures>({

  walletPage: async ({ page }, use) => {
    assertWalletsConfigured();
    const wp = await setupWalletPage(page, wallets[2]); // investor-a default
    await use(wp);
  },

  walletFor: async ({ page }, use) => {
    await use(async (role: WalletRole) => {
      const wallet = wallets.find(w => w.role === role);
      if (!wallet) throw new Error(`No wallet with role: ${role}`);
      return setupWalletPage(page, wallet);
    });
  },
});

export { expect } from '@playwright/test';

// ── Internal setup ────────────────────────────────────────────────────────────

async function setupWalletPage(page: Page, wallet: TestWallet): Promise<WalletPage> {
  const account = privateKeyToAccount(wallet.privateKey);

  const rpcClient = createPublicClient({
    chain: baseSepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport,
  });

  // Expose signing bridge to browser context
  await page.exposeFunction(
    '__nexusWalletRequest',
    async (method: string, params: any[]): Promise<any> => {
      try {
        switch (method) {

          case 'eth_sendTransaction': {
            const txParams = params[0];
            const [nonce, fees, gas] = await Promise.all([
              rpcClient.getTransactionCount({ address: account.address }),
              rpcClient.estimateFeesPerGas(),
              rpcClient.estimateGas({
                account: account.address,
                to: txParams.to as `0x${string}`,
                data: txParams.data as `0x${string}` | undefined,
                value: txParams.value ? BigInt(txParams.value) : undefined,
              }).catch(() => 300_000n), // fallback gas if estimate fails
            ]);

            const signedTx = await account.signTransaction({
              chainId: baseSepolia.id,
              type: 'eip1559',
              nonce,
              to: txParams.to as `0x${string}`,
              data: (txParams.data || '0x') as `0x${string}`,
              value: txParams.value ? BigInt(txParams.value) : 0n,
              gas: gas + 20_000n, // add buffer
              maxFeePerGas: fees.maxFeePerGas!,
              maxPriorityFeePerGas: fees.maxPriorityFeePerGas!,
            });

            const txHash = await rpcClient.request({
              method: 'eth_sendRawTransaction',
              params: [signedTx],
            }) as Hash;

            console.log(`  [${wallet.role}] tx: ${txHash}`);

            // Wait for receipt so the UI's waitForTransactionReceipt resolves
            const receipt = await rpcClient.waitForTransactionReceipt({
              hash: txHash,
              timeout: 60_000,
            });

            if (receipt.status === 'reverted') {
              throw new Error(`Transaction reverted: ${txHash}`);
            }

            return txHash;
          }

          case 'personal_sign': {
            const [message] = params;
            return account.signMessage({ message: { raw: message as `0x${string}` } });
          }

          case 'eth_signTypedData_v4': {
            const [, typedDataJson] = params;
            const typedData = JSON.parse(typedDataJson);
            return account.signTypedData(typedData);
          }

          case 'eth_getBalance': {
            return rpcClient.request({ method: 'eth_getBalance', params: params as any });
          }

          case 'eth_call': {
            return rpcClient.request({ method: 'eth_call', params: params as any });
          }

          case 'eth_estimateGas': {
            return rpcClient.request({ method: 'eth_estimateGas', params: params as any });
          }

          default: {
            // Forward to RPC
            return rpcClient.request({ method: method as any, params: params as any });
          }
        }
      } catch (err: any) {
        console.error(`  [${wallet.role}] wallet request error (${method}):`, err.shortMessage || err.message);
        throw err;
      }
    }
  );

  // Inject window.ethereum before any page scripts run
  await page.addInitScript(getInjectionScript(wallet.address));

  return new WalletPage(page, wallet);
}
