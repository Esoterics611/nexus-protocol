<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import { publicClient, formatNUSD } from "$lib/stores/wallet";
  import { getYieldSplitter, getCreditVault, getETFWrapper, getVault, getPrincipalToken, getYieldToken, getAddresses } from "$lib/contracts";
  import { onMount, onDestroy } from "svelte";

  let splitterTVL   = $state(0n);
  let creditTVL     = $state(0n);
  let etfTVL        = $state(0n);
  let ptSupply      = $state(0n);
  let ytSupply      = $state(0n);
  let etfPrice      = $state(0n);
  let loading       = $state(true);

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  async function load() {
    try {
      const splitter = getYieldSplitter(publicClient);
      const cv = getCreditVault(publicClient);
      const etf = getETFWrapper(publicClient);
      const pt = getPrincipalToken(publicClient);
      const yt = getYieldToken(publicClient);
      const addr = getAddresses();
      const collateralVaultAddr = await cv.read.collateralVault();
      const vault = getVault(collateralVaultAddr, publicClient);

      const [splitterShares, cvShares, etfNav, etfPPT, ptSup, ytSup] = await Promise.all([
        splitter.read.totalVaultShares(),
        (async () => {
          // CreditVault TVL = vault shares locked as collateral (summing all positions is not feasible on-chain)
          // Use vault's share balance held by creditVault as proxy
          return vault.read.balanceOf([addr.creditVault as `0x${string}`]);
        })(),
        etf.read.totalNAV(),
        etf.read.pricePerToken(),
        pt.read.totalSupply(),
        yt.read.totalSupply(),
      ]);

      // Convert splitter vault shares to NUSD value
      splitterTVL = await vault.read.convertToAssets([splitterShares]);
      // Convert creditVault share balance to NUSD value
      creditTVL = await vault.read.convertToAssets([cvShares]);
      etfTVL = etfNav;
      etfPrice = etfPPT;
      ptSupply = ptSup;
      ytSupply = ytSup;
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
</script>

<div class="page-header">
  <span class="prompt">></span> DERIVATIVES
</div>

<p class="subtitle">Structured products built on Nexus ERC-4626 vaults</p>

{#if loading}
  <div class="empty-state">AWAITING DATA</div>
{:else}
  <div class="stats-row">
    <StatCard label="Splitter TVL" value={fmtUSD(splitterTVL)} />
    <StatCard label="Credit TVL" value={fmtUSD(creditTVL)} />
    <StatCard label="ETF NAV" value={fmtUSD(etfTVL)} />
  </div>

  <div class="products">

    <a href="/derivatives/splitter" class="product-card">
      <div class="product-header">
        <span class="product-name">YIELD SPLITTER</span>
        <span class="arrow">→</span>
      </div>
      <p class="product-desc">
        Split vault shares into Principal Token (PT) and Yield Token (YT).
        PT redeems 1:1 at maturity. YT captures all yield until maturity.
      </p>
      <div class="product-stats">
        <div class="stat">
          <span class="stat-label">PT SUPPLY</span>
          <span class="stat-val">{Number(formatNUSD(ptSupply)).toLocaleString()}</span>
        </div>
        <div class="stat">
          <span class="stat-label">YT SUPPLY</span>
          <span class="stat-val">{Number(formatNUSD(ytSupply)).toLocaleString()}</span>
        </div>
        <div class="stat">
          <span class="stat-label">TVL</span>
          <span class="stat-val">{fmtUSD(splitterTVL)}</span>
        </div>
      </div>
    </a>

    <a href="/derivatives/credit" class="product-card">
      <div class="product-header">
        <span class="product-name">CREDIT VAULT</span>
        <span class="arrow">→</span>
      </div>
      <p class="product-desc">
        Borrow NUSD against vault share collateral. 150% collateral ratio,
        5% APY borrow rate. Liquidation at 120% LTV.
      </p>
      <div class="product-stats">
        <div class="stat">
          <span class="stat-label">COLLATERAL RATIO</span>
          <span class="stat-val">150%</span>
        </div>
        <div class="stat">
          <span class="stat-label">BORROW RATE</span>
          <span class="stat-val">5% APY</span>
        </div>
        <div class="stat">
          <span class="stat-label">TVL</span>
          <span class="stat-val">{fmtUSD(creditTVL)}</span>
        </div>
      </div>
    </a>

    <a href="/derivatives/etf" class="product-card">
      <div class="product-header">
        <span class="product-name">ETF WRAPPER</span>
        <span class="arrow">→</span>
      </div>
      <p class="product-desc">
        A single token backed by a basket of yield vaults with fixed allocation
        weights. Diversified exposure across the Nexus vault ecosystem.
      </p>
      <div class="product-stats">
        <div class="stat">
          <span class="stat-label">PRICE / TOKEN</span>
          <span class="stat-val">{etfPrice > 0n ? "$" + Number(formatNUSD(etfPrice)).toFixed(4) : "—"}</span>
        </div>
        <div class="stat">
          <span class="stat-label">NAV</span>
          <span class="stat-val">{fmtUSD(etfTVL)}</span>
        </div>
      </div>
    </a>

  </div>
{/if}

<style>
  .page-header {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
    margin-bottom: 0.5rem;
  }
  .prompt { color: var(--accent); }

  .subtitle {
    font-size: 0.75rem;
    color: var(--muted);
    letter-spacing: 0.06em;
    margin-bottom: 2rem;
  }

  .stats-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 2.5rem;
  }

  .products {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
  }

  .product-card {
    display: block;
    border: 1px solid var(--border-subtle);
    padding: 1.5rem;
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    transition: border-color 0.15s;
    border-left: 3px solid var(--accent);
  }
  .product-card:hover {
    border-color: #555;
  }

  .product-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .product-name {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
  }

  .arrow {
    color: var(--accent);
    font-size: 0.9rem;
  }

  .product-desc {
    font-size: 0.75rem;
    color: var(--muted);
    line-height: 1.6;
    margin-bottom: 1.25rem;
  }

  .product-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-top: 1px solid var(--border-subtle);
    padding-top: 1rem;
  }

  .stat {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
  }

  .stat-label {
    color: #666;
    letter-spacing: 0.08em;
  }

  .stat-val {
    font-family: var(--font-mono);
    color: var(--text);
  }

  .empty-state {
    color: #666;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 4rem;
  }
</style>
