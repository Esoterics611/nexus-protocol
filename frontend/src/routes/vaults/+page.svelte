<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import { address, publicClient, formatNUSD } from "$lib/stores/wallet";
  import { getVaultFactory, getVault, getStablecoin } from "$lib/contracts";
  import { onMount, onDestroy } from "svelte";

  interface VaultInfo {
    address: `0x${string}`;
    name: string;
    symbol: string;
    totalAssets: bigint;
    totalSupply: bigint;
    userShares: bigint;
    userValue: bigint;
  }

  let vaults = $state<VaultInfo[]>([]);
  let tvl = $state(0n);
  let loading = $state(true);

  async function load() {
    try {
      const factory = getVaultFactory(publicClient);
      const count = Number(await factory.read.getVaultCount());
      const results: VaultInfo[] = [];
      let cumTvl = 0n;

      for (let i = 0; i < count; i++) {
        const vaultAddr = await factory.read.getVault([BigInt(i)]);
        const vault = getVault(vaultAddr, publicClient);

        const [name, symbol, totalAssets, totalSupply] = await Promise.all([
          vault.read.name(),
          vault.read.symbol(),
          vault.read.totalAssets(),
          vault.read.totalSupply(),
        ]);

        let userShares = 0n;
        let userValue = 0n;
        if ($address) {
          userShares = await vault.read.balanceOf([$address]);
          if (userShares > 0n) {
            userValue = await vault.read.convertToAssets([userShares]);
          }
        }

        cumTvl += totalAssets;
        results.push({ address: vaultAddr, name, symbol, totalAssets, totalSupply, userShares, userValue });
      }
      vaults = results;
      tvl = cumTvl;
    } catch {
      // node unavailable
    }
    loading = false;
  }

  let _poll: ReturnType<typeof setInterval>;

  onMount(() => {
    load();
    _poll = setInterval(load, 12_000);
  });

  onDestroy(() => clearInterval(_poll));

  $effect(() => {
    // Re-run when wallet connects/disconnects to show user positions
    if ($address !== undefined) load();
  });

  function sharePrice(v: VaultInfo) {
    if (v.totalSupply === 0n) return "$1.0000";
    const price = (v.totalAssets * 1_000_000n) / v.totalSupply;
    return "$" + (Number(price) / 1_000_000).toFixed(4);
  }

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
</script>

<div class="page-header">
  <span class="prompt">></span> VAULTS
</div>

<div class="stats-row">
  <StatCard label="Total TVL" value={loading ? "—" : fmtUSD(tvl)} />
  <StatCard label="Vaults" value={loading ? "—" : String(vaults.length)} />
</div>

<div class="vault-table">
  <div class="table-header">
    <span>VAULT</span>
    <span>SYMBOL</span>
    <span class="right">SHARE PRICE</span>
    <span class="right">TVL</span>
    <span class="right">YOUR POSITION</span>
    <span></span>
  </div>
  {#if loading}
    <div class="table-empty">AWAITING DATA</div>
  {:else if vaults.length === 0}
    <div class="table-empty">NO VAULTS DEPLOYED</div>
  {:else}
    {#each vaults as v}
      <a href="/vaults/{v.address}" class="table-row">
        <span class="name">{v.name}</span>
        <span class="symbol">{v.symbol}</span>
        <span class="right mono">{sharePrice(v)}</span>
        <span class="right mono">{fmtUSD(v.totalAssets)}</span>
        <span class="right mono">{v.userShares > 0n ? fmtUSD(v.userValue) : "—"}</span>
        <span class="arrow right">→</span>
      </a>
    {/each}
  {/if}
</div>

<style>
  .page-header {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
    margin-bottom: 1.5rem;
  }
  .prompt { color: var(--accent); }

  .stats-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .vault-table { width: 100%; }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 2rem;
    padding: 0.4rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 2rem;
    padding: 0.6rem 0;
    color: var(--text);
    font-size: 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
    transition: background 0.1s;
    align-items: center;
  }
  .table-row:hover { background: var(--surface); }
  .name { font-weight: 500; }
  .symbol { color: var(--muted); font-family: var(--font-mono); font-size: 0.8rem; }
  .mono { font-family: var(--font-mono); }
  .right { text-align: right; }
  .arrow { color: var(--accent); }
  .table-empty {
    padding: 3rem;
    text-align: center;
    color: var(--muted-dim);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
  }
</style>
