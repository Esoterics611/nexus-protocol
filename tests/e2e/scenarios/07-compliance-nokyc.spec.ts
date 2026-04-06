/**
 * Scenario 07: Compliance — No KYC — @smoke
 *
 * wallet[7] (no-kyc) attempts to deposit into the vault.
 * Expects: transaction reverts (KYCRegistry check fails).
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS } from '../wallets/index.js';

const VAULT_URL = `/vaults/${CONTRACTS.yieldVault}`;

test.describe('Compliance — No KYC @smoke', () => {

  test('non-KYC wallet cannot deposit (tx reverts)', async ({ walletFor }) => {
    const wp = await walletFor('no-kyc');

    await wp.gotoConnected(VAULT_URL);

    // Vault inputs use placeholder="0.00". TxButton renders "APPROVE & DEPOSIT" (not "DEPOSIT").
    const depositInput = wp.page.getByPlaceholder('0.00').first();
    await expect(depositInput).toBeVisible({ timeout: 10_000 });
    await depositInput.fill('10');

    const depositBtn = wp.page.getByRole('button', { name: /APPROVE & DEPOSIT/i });
    await expect(depositBtn).toBeEnabled({ timeout: 5_000 });
    await depositBtn.click();

    // Toast has class "toast error" on revert.
    const errorToast = wp.page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 60_000 });
    console.log('  ✅ Non-KYC wallet correctly blocked from deposit');
  });

});
