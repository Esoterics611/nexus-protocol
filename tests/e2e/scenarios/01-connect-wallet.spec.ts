/**
 * Scenario 01: Connect Wallet — @smoke
 *
 * Verifies the EIP-1193 injection works for all 10 wallets.
 * If this suite passes, every subsequent test can rely on wallet injection.
 */

import { test, expect } from '@playwright/test';
import { wallets } from '../wallets/index.js';
import { getInjectionScript } from '../inject/ethereum-provider.js';
import { setupWalletBridge } from './helpers.js';

test.describe('Connect Wallet @smoke', () => {

  for (const wallet of wallets) {
    test(`wallet[${wallet.index}] (${wallet.role}) can connect`, async ({ page }) => {
      await setupWalletBridge(page, wallet);
      await page.addInitScript(getInjectionScript(wallet.address));

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click connect wallet
      const connectBtn = page.getByRole('button', { name: '[ CONNECT WALLET ]' });
      await expect(connectBtn).toBeVisible({ timeout: 5_000 });
      await connectBtn.click();

      // After connecting, button shows shortened address
      const connectedBtn = page.locator('button.wallet-btn.connected');
      await expect(connectedBtn).toBeVisible({ timeout: 10_000 });

      // Address format: 0x1234...5678
      const btnText = await connectedBtn.textContent();
      const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
      expect(btnText?.trim()).toContain(shortAddr);

      console.log(`  ✅ wallet[${wallet.index}] ${wallet.role}: connected as ${shortAddr}`);
    });
  }
});
