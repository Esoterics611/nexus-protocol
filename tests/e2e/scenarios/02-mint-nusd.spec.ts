/**
 * Scenario 02: Mint NUSD — @smoke
 *
 * wallet[1] (minter) navigates to /admin/mint, mints 500 NUSD to wallet[2] (investor-a).
 * Asserts: total supply stat updates on page.
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { getWallet, CONTRACTS } from '../wallets/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { RPC_URL } from '../wallets/index.js';

const STABLECOIN_ABI = parseAbi(['function totalSupply() view returns (uint256)']);
const rpc = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

test.describe('Mint NUSD @smoke', () => {

  test('wallet[1] minter can mint 500 NUSD to investor-a', async ({ walletFor }) => {
    const minter = getWallet('minter');
    const investorA = getWallet('investor-a');
    const wp = await walletFor('minter');

    // Record total supply before
    const supplyBefore = await rpc.readContract({
      address: CONTRACTS.stablecoin,
      abi: STABLECOIN_ABI,
      functionName: 'totalSupply',
    });
    console.log(`  Supply before: ${Number(supplyBefore) / 1e6} NUSD`);

    // Navigate and connect
    await wp.gotoConnected('/admin/mint');

    // Fill mint form: recipient + amount
    // Mint page has two '0x...' inputs (mint recipient + set-allocation minter).
    // Amount inputs have placeholder '0.00' (not 'Amount').
    await wp.page.getByPlaceholder('0x...').first().fill(investorA.address);
    await wp.page.getByPlaceholder('0.00').first().fill('500');

    // Click the mint TxButton
    // Note: /MINT/i also matches "SET ALLOCATION" etc — use .first() which is the MINT card button
    await wp.page.getByRole('button', { name: /^MINT$/i }).first().click();

    // TxButton shows "▋CONFIRMING" (CSS dots via ::after) — there is no literal "..." in text.
    // Poll the on-chain supply until it increases instead of checking button state.
    console.log('  Polling supply for increase...');
    await expect.poll(
      async () => {
        const current = await rpc.readContract({
          address: CONTRACTS.stablecoin,
          abi: STABLECOIN_ABI,
          functionName: 'totalSupply',
        });
        return current > supplyBefore;
      },
      { timeout: 90_000, intervals: [2_000, 3_000, 5_000, 8_000] },
    ).toBeTruthy();

    const supplyAfter = await rpc.readContract({
      address: CONTRACTS.stablecoin,
      abi: STABLECOIN_ABI,
      functionName: 'totalSupply',
    });
    console.log(`  Supply after:  ${Number(supplyAfter) / 1e6} NUSD`);
    expect(supplyAfter - supplyBefore).toBeGreaterThanOrEqual(500_000_000n); // 500 NUSD
  });

});
