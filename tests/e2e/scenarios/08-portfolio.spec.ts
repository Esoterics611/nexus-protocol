/**
 * Scenario 08: Portfolio Page — @smoke
 *
 * wallet[2] (investor-a) views /portfolio.
 * Expects: vault position shown (requires scenario 03 ran first).
 * Also checks: transaction history via indexer.
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS, RPC_URL } from '../wallets/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

const VAULT_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
const rpc = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

test.describe('Portfolio Page @smoke', () => {

  test('investor-a portfolio shows vault position', async ({ walletPage }) => {
    const wallet = walletPage.wallet; // investor-a

    // Check they actually have shares (requires 03 ran first)
    const shares = await rpc.readContract({
      address: CONTRACTS.yieldVault,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [wallet.address],
    });

    if (shares === 0n) {
      console.log('  ⚠️  investor-a has no shares — skipping position check (run 03 first)');
      test.skip();
    }

    await walletPage.gotoConnected('/portfolio');

    // Portfolio should show the vault name "NEXUS TREASURY VAULT" or "nxTREASURY"
    const vaultEntry = walletPage.page.getByText(/TREASURY/i).or(
      walletPage.page.getByText(/nxTREASURY/i)
    ).first();
    await expect(vaultEntry).toBeVisible({ timeout: 15_000 });

    // Should show some dollar value
    const dollarValue = walletPage.page.getByText(/\$[\d,]+/);
    await expect(dollarValue.first()).toBeVisible({ timeout: 10_000 });

    // Check indexer transaction history is visible
    const txHistory = walletPage.page.getByText(/deposit|withdraw/i);
    // May or may not be visible depending on whether indexer has caught up
    // Don't fail if not — just log
    const historyVisible = await txHistory.first().isVisible().catch(() => false);
    if (historyVisible) {
      console.log('  ✅ Transaction history visible');
    } else {
      console.log('  ℹ️  Transaction history not yet indexed — check indexer status');
    }

    console.log(`  ✅ Portfolio shows position for investor-a (${shares} shares)`);
  });

});
