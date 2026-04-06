/**
 * Scenario 06: Compliance — Restricted Wallet — @smoke
 *
 * wallet[6] (restricted) attempts to deposit into the vault.
 * Expects: transaction reverts (TransferRestrictions blocks the transfer).
 *
 * Note: the revert happens inside the vault's deposit→transfer check.
 * The TxButton will show an error state.
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS } from '../wallets/index.js';

const VAULT_URL = `/vaults/${CONTRACTS.yieldVault}`;

test.describe('Compliance — Restricted Wallet @smoke', () => {

  test('restricted wallet cannot deposit (tx reverts)', async ({ walletFor }) => {
    const wp = await walletFor('restricted');

    await wp.gotoConnected(VAULT_URL);

    // Attempt deposit.
    // Vault inputs use placeholder="0.00". TxButton renders "APPROVE & DEPOSIT" (not "DEPOSIT").
    const depositInput = wp.page.getByPlaceholder('0.00').first();
    await expect(depositInput).toBeVisible({ timeout: 10_000 });
    await depositInput.fill('10');

    const depositBtn = wp.page.getByRole('button', { name: /APPROVE & DEPOSIT/i });
    await expect(depositBtn).toBeEnabled({ timeout: 5_000 });
    await depositBtn.click();

    // Toast has class "toast error" on revert — any error toast confirms the revert.
    // TxButton catches the throw from the signing bridge and calls addToast(..., "error").
    const errorToast = wp.page.locator('.toast.error');
    await expect(errorToast).toBeVisible({ timeout: 60_000 });
    console.log('  ✅ Restricted wallet correctly blocked from deposit');
  });

});
