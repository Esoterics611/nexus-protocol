/**
 * Scenario 04: Vault Withdraw — @smoke
 *
 * wallet[2] (investor-a) withdraws 50 NUSD from the Treasury Vault.
 * Requires: scenario 03 ran first (investor-a has a vault position).
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS, RPC_URL } from '../wallets/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { waitForIndexer } from './helpers.js';

const STABLECOIN_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const rpc = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

const VAULT_URL = `/vaults/${CONTRACTS.yieldVault}`;

test.describe('Vault Withdraw @smoke', () => {

  test('investor-a withdraws 50 NUSD from Treasury Vault', async ({ walletPage }) => {
    const wallet = walletPage.wallet; // investor-a

    // Record NUSD balance before
    const nusdBefore = await rpc.readContract({
      address: CONTRACTS.stablecoin,
      abi: STABLECOIN_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });
    console.log(`  NUSD before: ${Number(nusdBefore) / 1e6}`);

    await walletPage.gotoConnected(VAULT_URL);

    // Switch to WITHDRAW tab.
    // The tab strip has two <button> elements: "DEPOSIT" and "WITHDRAW".
    // Scope to .tab-strip to avoid matching the TxButton "WITHDRAW" form submit.
    const withdrawTab = walletPage.page.locator('.tab-strip').getByRole('button', { name: 'WITHDRAW' });
    await expect(withdrawTab).toBeVisible({ timeout: 10_000 });
    await withdrawTab.click();

    // Vault inputs use placeholder="0.00" (not "Amount").
    const withdrawInput = walletPage.page.getByPlaceholder('0.00').first();
    await expect(withdrawInput).toBeVisible({ timeout: 5_000 });
    await withdrawInput.fill('50');

    // The TxButton form submit also says "WITHDRAW" — use the .txbtn class to target it,
    // not the tab strip button which is a plain <button>.
    const withdrawBtn = walletPage.page.locator('button.txbtn');
    await expect(withdrawBtn).toBeEnabled({ timeout: 5_000 });
    await withdrawBtn.click();

    // TxButton shows "▋CONFIRMING" (CSS dots) — poll on-chain balance instead of button text.
    console.log('  Polling NUSD balance for increase...');
    await expect.poll(
      async () => {
        const current = await rpc.readContract({
          address: CONTRACTS.stablecoin,
          abi: STABLECOIN_ABI,
          functionName: 'balanceOf',
          args: [wallet.address],
        });
        return current > nusdBefore;
      },
      { timeout: 120_000, intervals: [3_000, 5_000, 8_000, 12_000] },
    ).toBeTruthy();

    const nusdAfter = await rpc.readContract({
      address: CONTRACTS.stablecoin,
      abi: STABLECOIN_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });
    console.log(`  NUSD after:  ${Number(nusdAfter) / 1e6}`);
    expect(nusdAfter).toBeGreaterThan(nusdBefore);

    // Indexer records the withdrawal
    await waitForIndexer(
      walletPage.page,
      `/api/vault-transactions?vault=${CONTRACTS.yieldVault}&owner=${wallet.address}&limit=20`,
      (data: any[]) => data.some(tx => tx.txType === 'withdraw'),
    );
    console.log('  ✅ Withdrawal indexed');
  });

});
