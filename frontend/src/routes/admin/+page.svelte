<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import { connected, publicClient, formatNUSD } from "$lib/stores/wallet";
  import { getStablecoin, getReserveTracker, getNAVOracle } from "$lib/contracts";
  import { onMount, onDestroy } from "svelte";

  let reserveRatio = $state<string>("—");
  let oracleFreshness = $state<string>("—");
  let pauseStatus = $state<string>("—");
  let loading = $state(true);

  async function load() {
    try {
      const stablecoin = getStablecoin(publicClient);
      const reserveTracker = getReserveTracker(publicClient);
      const navOracle = getNAVOracle(publicClient);

      const [supply, totalReserves, paused, [, navTimestamp]] = await Promise.all([
        stablecoin.read.totalSupply(),
        reserveTracker.read.getTotalReserves(),
        stablecoin.read.paused(),
        navOracle.read.getLatestNAV(),
      ]);

      if (supply > 0n) {
        const ratio = Number((totalReserves * 10000n) / supply) / 100;
        reserveRatio = ratio.toFixed(2) + "%";
      } else {
        reserveRatio = "N/A";
      }

      pauseStatus = paused ? "Paused" : "Active";

      const now = Math.floor(Date.now() / 1000);
      if (navTimestamp === 0n) {
        oracleFreshness = "Never posted";
      } else {
        const ageSeconds = now - Number(navTimestamp);
        if (ageSeconds < 3600) {
          oracleFreshness = Math.floor(ageSeconds / 60) + "m ago";
        } else if (ageSeconds < 86400) {
          const h = Math.floor(ageSeconds / 3600);
          const m = Math.floor((ageSeconds % 3600) / 60);
          oracleFreshness = h + "h " + m + "m ago";
        } else {
          oracleFreshness = Math.floor(ageSeconds / 86400) + "d ago";
        }
      }
    } catch {
      // node unavailable
    }
    loading = false;
  }

  let _poll: ReturnType<typeof setInterval>;
  let now = $state(new Date());

  onMount(() => {
    load();
    _poll = setInterval(() => { load(); now = new Date(); }, 30_000);
  });

  onDestroy(() => clearInterval(_poll));

  function timestamp() {
    return now.toISOString().replace("T", " ").slice(0, 19);
  }
</script>

<div class="page-header">
  <span class="prompt">></span> SYSTEM STATUS <span class="timestamp">{timestamp()}</span>
</div>

{#if !$connected}
  <div class="empty-state">CONNECT ADMIN WALLET TO ACCESS OPERATOR FUNCTIONS</div>
{:else}
  <div class="stats-row">
    <div class="stat">
      <span class="stat-label">RESERVE RATIO</span>
      <span class="stat-value">{loading ? "—" : reserveRatio}</span>
    </div>
    <div class="stat">
      <span class="stat-label">ORACLE AGE</span>
      <span class="stat-value">{loading ? "—" : oracleFreshness}</span>
    </div>
    <div class="stat">
      <span class="stat-label">PROTOCOL STATUS</span>
      <span class="stat-value">
        {loading ? "—" : pauseStatus.toUpperCase()}
        {#if !loading && pauseStatus === "Active"}
          <span class="status-dot active"></span>
        {:else if !loading}
          <span class="status-warn">⚠</span>
        {/if}
      </span>
    </div>
  </div>

  <div class="section-label">OPERATIONS</div>
  <div class="nav-grid">
    <a href="/admin/mint" class="nav-card">
      <div class="nav-title">MINT OPERATIONS</div>
      <div class="nav-desc">Manage allocations, mint/burn NUSD</div>
    </a>
    <a href="/admin/compliance" class="nav-card">
      <div class="nav-title">COMPLIANCE</div>
      <div class="nav-desc">Denylist, KYC, accreditation management</div>
    </a>
    <a href="/admin/oracle" class="nav-card">
      <div class="nav-title">NAV ORACLE</div>
      <div class="nav-desc">Post NAV updates, view history</div>
    </a>
    <a href="/admin/reserves" class="nav-card">
      <div class="nav-title">RESERVES</div>
      <div class="nav-desc">Reserve composition, ratio tracking</div>
    </a>
  </div>
{/if}

<style>
  .page-header {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
    margin-bottom: 2rem;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .prompt { color: var(--accent); }
  .timestamp {
    margin-left: auto;
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--muted);
    letter-spacing: 0.05em;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    margin-bottom: 2.5rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid #1a1a1a;
  }
  .stat { display: flex; flex-direction: column; }
  .stat-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.1em;
  }
  .stat-value {
    font-size: 1.75rem;
    font-weight: 500;
    color: var(--text);
    margin-top: 0.25rem;
    font-family: var(--font-mono);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .status-dot.active {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }
  .status-warn { color: var(--warn); font-size: 1rem; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .section-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .nav-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  .nav-card {
    border: 1px solid var(--border);
    border-radius: 1px;
    padding: 1.5rem;
    background: var(--surface-alt);
    color: var(--text);
    transition: border-color 0.15s;
  }
  .nav-card:hover {
    border-color: #444;
    color: var(--text);
  }
  .nav-title {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    margin-bottom: 0.5rem;
  }
  .nav-desc {
    color: var(--muted);
    font-size: 0.8rem;
  }

  .empty-state {
    color: var(--muted-dim);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 4rem;
  }
</style>
