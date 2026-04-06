/**
 * Scenario 09: Admin Dashboard — @smoke
 *
 * wallet[0] (admin) views the admin dashboard and checks all stat cards load.
 * Also tests: setting an allocation for wallet[9] (spare).
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { getWallet } from '../wallets/index.js';

test.describe('Admin Dashboard @smoke', () => {

  test('admin can view dashboard stats', async ({ walletFor }) => {
    const wp = await walletFor('admin');
    await wp.gotoConnected('/admin');

    // Wait for stats to load — reserve ratio, oracle freshness, pause status
    // These are StatCard components showing values
    await expect(wp.page.locator('text=/RESERVE RATIO|ORACLE|PAUSE/i').first())
      .toBeVisible({ timeout: 15_000 });

    // No "NaN" or undefined values should appear
    const nanText = wp.page.getByText('NaN');
    const undefinedText = wp.page.getByText('undefined');
    expect(await nanText.count()).toBe(0);
    expect(await undefinedText.count()).toBe(0);

    console.log('  ✅ Admin dashboard loaded without NaN/undefined');
  });

  test('admin can set mint allocation for spare wallet', async ({ walletFor }) => {
    const wp = await walletFor('admin');
    const spare = getWallet('spare');

    await wp.gotoConnected('/admin/mint');

    // Find the SET ALLOCATION section
    // allocMinter input and allocCeiling input
    const inputs = wp.page.getByPlaceholder('0x...');
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 });

    // Fill minter address (second 0x... input — first is for mint recipient)
    await inputs.nth(1).fill(spare.address);

    // Fill ceiling amount.
    // Amount inputs on the mint page use placeholder="0.00" (not 'Amount').
    // nth(1) = the ceiling field in the SET ALLOCATION card (nth(0) is in the MINT NUSD card).
    const amountInputs = wp.page.getByPlaceholder('0.00');
    await amountInputs.nth(1).fill('5000'); // 5000 NUSD ceiling

    // Click SET ALLOCATION button
    const setAllocBtn = wp.page.getByRole('button', { name: /SET ALLOCATION/i });
    await expect(setAllocBtn).toBeVisible();
    await setAllocBtn.click();

    // Wait for completion
    await expect(setAllocBtn).not.toContainText('...', { timeout: 90_000 });

    console.log(`  ✅ Set 5000 NUSD allocation for spare wallet (${spare.address.slice(0, 10)}...)`);
  });

});
