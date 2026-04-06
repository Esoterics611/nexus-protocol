/**
 * Scenario 03: Vault Deposit — @smoke
 *
 * wallet[2] (investor-a) deposits 100 NUSD into the Treasury Vault.
 * Asserts: user has vault shares after deposit, indexer records the event.
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS, RPC_URL } from '../wallets/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { waitForIndexer } from './helpers.js';

const VAULT_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
]);
const rpc = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

const VAULT_URL = `/vaults/${CONTRACTS.yieldVault}`;

test.describe('Vault Deposit @smoke', () => {

  test('investor-a deposits 100 NUSD into Treasury Vault', async ({ walletPage }) => {
    // walletPage is pre-configured as investor-a (wallet[2])
    const wallet = walletPage.wallet;

    // Record shares before
    const sharesBefore = await rpc.readContract({
      address: CONTRACTS.yieldVault,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });
    console.log(`  Shares before: ${sharesBefore}`);

    // Navigate to vault and connect
    await walletPage.gotoConnected(VAULT_URL);

    // Deposit tab is the default — no need to click the tab first.
    // Vault inputs use placeholder="0.00" (not "Amount").
    const depositInput = walletPage.page.getByPlaceholder('0.00').first();
    await expect(depositInput).toBeVisible({ timeout: 10_000 });
    await depositInput.fill('100');

    // The TxButton renders as "APPROVE & DEPOSIT" (approve step + deposit step combined).
    // Avoid /DEPOSIT/i which also matches the tab strip "DEPOSIT" button.
    const depositBtn = walletPage.page.getByRole('button', { name: /APPROVE & DEPOSIT/i });
    await expect(depositBtn).toBeEnabled({ timeout: 5_000 });
    await depositBtn.click();

    // TxButton shows "▋CONFIRMING" (CSS dots) — poll on-chain state instead of button text.
    console.log('  Polling shares for increase...');
    await expect.poll(
      async () => {
        const current = await rpc.readContract({
          address: CONTRACTS.yieldVault,
          abi: VAULT_ABI,
          functionName: 'balanceOf',
          args: [wallet.address],
        });
        return current > sharesBefore;
      },
      { timeout: 120_000, intervals: [3_000, 5_000, 8_000, 12_000] },
    ).toBeTruthy();

    const sharesAfter = await rpc.readContract({
      address: CONTRACTS.yieldVault,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });
    console.log(`  Shares after:  ${sharesAfter}`);
    expect(sharesAfter).toBeGreaterThan(sharesBefore);

    // Wait for indexer to record the deposit (up to 90s for next poll + processing)
    console.log('  Waiting for indexer...');
    await waitForIndexer(
      walletPage.page,
      `/api/vault-transactions?vault=${CONTRACTS.yieldVault}&owner=${wallet.address}&limit=10`,
      (data: any[]) => data.some(tx =>
        tx.txType === 'deposit' &&
        tx.owner.toLowerCase() === wallet.address.toLowerCase()
      ),
    );
    console.log('  ✅ Deposit indexed');
  });

});
