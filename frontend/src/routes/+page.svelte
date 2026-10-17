<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import { address, connected, publicClient, formatNUSD } from "$lib/stores/wallet";
  import { getStablecoin, getVaultFactory, getVault } from "$lib/contracts";
  import { onMount } from "svelte";

  let totalSupply = $state<bigint | null>(null);
  let tvl = $state<bigint | null>(null);
  let vaultCount = $state<number | null>(null);
  let userNUSD = $state<bigint | null>(null);
  let vaultPreviews = $state<{ address: string; name: string; symbol: string; totalAssets: bigint; totalSupply: bigint }[]>([]);
  let loading = $state(true);

  async function loadProtocolData() {
    try {
      const stablecoin = getStablecoin(publicClient);
      const factory = getVaultFactory(publicClient);

      const [supply, count] = await Promise.all([
        stablecoin.read.totalSupply(),
        factory.read.getVaultCount(),
      ]);
      totalSupply = supply;
      vaultCount = Number(count);

      // Load each vault
      let cumTvl = 0n;
      const previews = [];
      for (let i = 0; i < vaultCount; i++) {
        const vaultAddr = await factory.read.getVault([BigInt(i)]);
        const vault = getVault(vaultAddr, publicClient);
        const [name, symbol, assets, supply] = await Promise.all([
          vault.read.name(),
          vault.read.symbol(),
          vault.read.totalAssets(),
          vault.read.totalSupply(),
        ]);
        cumTvl += assets;
        previews.push({ address: vaultAddr, name, symbol, totalAssets: assets, totalSupply: supply });
      }
      tvl = cumTvl;
      vaultPreviews = previews;
    } catch {
      // contracts not deployed or node unavailable — show placeholder zeros
    }
    loading = false;
  }

  async function loadUserData(acc: `0x${string}`) {
    try {
      const stablecoin = getStablecoin(publicClient);
      userNUSD = await stablecoin.read.balanceOf([acc]);
    } catch {
      userNUSD = null;
    }
  }

  onMount(loadProtocolData);

  $effect(() => {
    if ($address) loadUserData($address);
    else userNUSD = null;
  });

  function fmtUSD(v: bigint | null) {
    if (v === null) return loading ? "—" : "$0";
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function sharePrice(v: { totalAssets: bigint; totalSupply: bigint }) {
    if (v.totalSupply === 0n) return "$1.0000";
    const price = (v.totalAssets * 1_000_000n) / v.totalSupply;
    return "$" + (Number(price) / 1_000_000).toFixed(4);
  }
</script>

<div class="stats-row">
  <div class="stat">
    <span class="stat-label">TOTAL VALUE LOCKED</span>
    <span class="stat-value">{fmtUSD(tvl)}</span>
  </div>
  <div class="stat">
    <span class="stat-label">NUSD SUPPLY</span>
    <span class="stat-value">{fmtUSD(totalSupply)}</span>
  </div>
  <div class="stat">
    <span class="stat-label">ACTIVE VAULTS</span>
    <span class="stat-value">{vaultCount === null ? (loading ? "—" : "0") : String(vaultCount)}</span>
  </div>
</div>

{#if $connected}
  <div class="divider"></div>
  <div class="stats-row compact">
    <div class="stat">
      <span class="stat-label">YOUR NUSD</span>
      <span class="stat-value small">{fmtUSD(userNUSD)}</span>
    </div>
  </div>
  <a href="/portfolio" class="cta">VIEW PORTFOLIO <span class="arrow">→</span></a>
{/if}

<div class="section-header">
  <span class="section-title">TREASURY VAULTS</span>
</div>

<div class="vault-table">
  <div class="vault-header-row">
    <span>VAULT NAME</span>
    <span>SYMBOL</span>
    <span class="right">TVL</span>
    <span class="right">SHARE PRICE</span>
    <span></span>
  </div>
  {#if vaultPreviews.length === 0}
    <div class="vault-empty">
      {loading ? "AWAITING DATA" : "NO VAULTS DEPLOYED"}
    </div>
  {:else}
    {#each vaultPreviews as vault}
      <a href="/vaults/{vault.address}" class="vault-row">
        <span class="vault-name">{vault.name}</span>
        <span class="vault-symbol">{vault.symbol}</span>
        <span class="vault-tvl right">{fmtUSD(vault.totalAssets)}</span>
        <span class="right">{sharePrice(vault)}</span>
        <span class="arrow">→</span>
      </a>
    {/each}
  {/if}
</div>
{#if !loading && vaultPreviews.length > 0}
  <a href="/vaults" class="cta" style="margin-top: 1rem;">BROWSE ALL VAULTS <span class="arrow">→</span></a>
{/if}

<style>
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    padding: 1.5rem 0;
  }
  .stats-row.compact {
    grid-template-columns: 1fr;
    padding: 0.75rem 0;
  }
  .stat { display: flex; flex-direction: column; }
  .stat-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .stat-value {
    font-size: 2rem;
    font-weight: 500;
    color: var(--text);
    margin-top: 0.25rem;
    font-family: var(--font-mono);
  }
  .stat-value.small { font-size: 1.25rem; }

  .divider {
    border-bottom: 1px solid #1a1a1a;
    margin: 0.5rem 0;
  }

  .cta {
    font-size: 0.75rem;
    color: var(--muted);
    letter-spacing: 0.08em;
    display: inline-block;
    margin-bottom: 2rem;
    transition: color 0.15s;
  }
  .cta:hover { color: var(--text); }
  .arrow { color: var(--accent); }

  .section-header {
    border-top: 1px solid #1a1a1a;
    border-bottom: 1px solid #1a1a1a;
    padding: 0.6rem 0;
    margin-bottom: 0;
  }
  .section-title {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
  }

  .vault-table { width: 100%; }
  .vault-header-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 2rem;
    padding: 0.5rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .vault-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 2rem;
    padding: 0.75rem 0;
    color: var(--text);
    font-size: 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
    transition: background 0.1s;
    align-items: center;
  }
  .vault-row:hover { background: var(--surface); }
  .vault-name { font-weight: 500; }
  .vault-symbol { color: var(--muted); font-family: var(--font-mono); font-size: 0.8rem; }
  .vault-tvl { font-family: var(--font-mono); }
  .right { text-align: right; }
  .vault-empty {
    padding: 2rem;
    text-align: center;
    color: var(--muted-dim);
    font-size: 0.8rem;
    letter-spacing: 0.1em;
  }
</style>
