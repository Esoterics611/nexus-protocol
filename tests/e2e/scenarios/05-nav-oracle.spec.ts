/**
 * Scenario 05: NAV Oracle Posting — @smoke
 *
 * wallet[5] (reporter) navigates to /admin/oracle and posts a new NAV.
 * Asserts: oracle page updates, indexer records the NAV entry.
 */

import { test, expect } from '../fixtures/wallet-fixture.js';
import { CONTRACTS, RPC_URL } from '../wallets/index.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { waitForIndexer } from './helpers.js';

const ORACLE_ABI = parseAbi([
  // Contract function is getLatestNAV() — not latestNAV()
  'function getLatestNAV() view returns (uint256 totalAssets, uint256 timestamp)',
]);
const rpc = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });

// Post 92M NUSD as the new NAV (6 decimals: 92_000_000 * 1e6)
const NEW_NAV_NUSD = '92000000';

test.describe('NAV Oracle @smoke', () => {

  test('reporter posts a new NAV', async ({ walletFor }) => {
    const wp = await walletFor('reporter');

    // Read current NAV
    const [navBefore] = await rpc.readContract({
      address: CONTRACTS.navOracle,
      abi: ORACLE_ABI,
      functionName: 'getLatestNAV',
    });
    console.log(`  NAV before: $${Number(navBefore) / 1e6}`);

    // Navigate and connect
    await wp.gotoConnected('/admin/oracle');

    // Find NAV input and post.
    // Oracle page uses placeholder="1000000.00" (the template value shown in the input).
    const navInput = wp.page.getByPlaceholder('1000000.00').first();
    await expect(navInput).toBeVisible({ timeout: 10_000 });
    await navInput.fill(NEW_NAV_NUSD);

    const postBtn = wp.page.getByRole('button', { name: /POST NAV/i });
    await expect(postBtn).toBeEnabled({ timeout: 5_000 });
    await postBtn.click();

    // TxButton shows "▋CONFIRMING" (CSS dots) — poll on-chain NAV instead of button text.
    console.log('  Polling NAV oracle for update...');
    await expect.poll(
      async () => {
        try {
          const [current] = await rpc.readContract({
            address: CONTRACTS.navOracle,
            abi: ORACLE_ABI,
            functionName: 'getLatestNAV',
          });
          return current === BigInt(NEW_NAV_NUSD) * 1_000_000n;
        } catch {
          return false;
        }
      },
      { timeout: 90_000, intervals: [2_000, 3_000, 5_000, 8_000] },
    ).toBeTruthy();

    const [navAfter] = await rpc.readContract({
      address: CONTRACTS.navOracle,
      abi: ORACLE_ABI,
      functionName: 'getLatestNAV',
    });
    console.log(`  NAV after:  $${Number(navAfter) / 1e6}`);

    // Poll already confirmed the value equals 92M NUSD — assert for clarity
    expect(navAfter).toBe(BigInt(NEW_NAV_NUSD) * 1_000_000n);

    // Indexer records it
    await waitForIndexer(
      wp.page,
      `/api/nav-history?vault=${CONTRACTS.yieldVault}&limit=5`,
      (data: any[]) => data.length > 0 &&
        data[0].totalAssets === String(BigInt(NEW_NAV_NUSD) * 1_000_000n),
    );
    console.log('  ✅ NAV indexed');
  });

});
