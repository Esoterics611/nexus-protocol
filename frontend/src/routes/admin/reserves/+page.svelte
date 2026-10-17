<script lang="ts">
  import TxButton from "$lib/components/TxButton.svelte";
  import { walletClient, publicClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getReserveTracker, getStablecoin } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";

  interface ReserveEntry {
    assetType: string;
    amount: bigint;
    timestamp: bigint;
    reporter: `0x${string}`;
  }

  let totalReserves = $state(0n);
  let nusdSupply = $state(0n);
  let history = $state<ReserveEntry[]>([]);
  let loading = $state(true);

  let assetType = $state("T-Bill-3M");
  let reserveAmount = $state("");

  async function load() {
    loading = true;
    try {
      const tracker = getReserveTracker(publicClient);
      const stablecoin = getStablecoin(publicClient);
      const [total, supply, hist] = await Promise.all([
        tracker.read.getTotalReserves(),
        stablecoin.read.totalSupply(),
        tracker.read.getReserveHistory(),
      ]);
      totalReserves = total;
      nusdSupply = supply;
      history = [...hist].reverse(); // newest first
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

  function reserveRatio() {
    if (nusdSupply === 0n) return "N/A";
    const r = Number((totalReserves * 10000n) / nusdSupply) / 100;
    return r.toFixed(2) + "%";
  }

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function fmtTime(ts: bigint) {
    return new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16);
  }

  // Build composition: latest amount per asset type
  function composition() {
    const latest = new Map<string, bigint>();
    for (const e of [...history].reverse()) {
      if (!latest.has(e.assetType)) latest.set(e.assetType, e.amount);
    }
    return [...latest.entries()];
  }

  async function handlePostReserve() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!reserveAmount) throw new Error("Enter an amount");
    const tracker = getReserveTracker(wc);
    const tx = await tracker.write.postReserve([assetType, parseNUSD(reserveAmount)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    reserveAmount = "";
    await load();
  }
</script>

<a href="/admin" class="back">← DASHBOARD</a>
<div class="page-header">
  <span class="prompt">></span> RESERVE TRACKING <span class="line"></span>
</div>

<div class="stats-row">
  <div class="stat">
    <span class="stat-label">TOTAL RESERVES</span>
    <span class="stat-value">{loading ? "—" : fmtUSD(totalReserves)}</span>
  </div>
  <div class="stat">
    <span class="stat-label">NUSD SUPPLY</span>
    <span class="stat-value">{loading ? "—" : fmtUSD(nusdSupply)}</span>
  </div>
  <div class="stat">
    <span class="stat-label">RESERVE RATIO</span>
    <span class="stat-value" class:healthy={!loading && nusdSupply > 0n && totalReserves >= nusdSupply}>{loading ? "—" : reserveRatio()}</span>
  </div>
</div>

<div class="grid">
  <section class="card">
    <div class="card-title">POST RESERVE UPDATE</div>
    <label>ASSET TYPE</label>
    <select bind:value={assetType}>
      <option>T-Bill-3M</option>
      <option>T-Bill-6M</option>
      <option>USDC</option>
      <option>Cash</option>
    </select>
    <label>AMOUNT (USD)</label>
    <input type="number" bind:value={reserveAmount} placeholder="0.00" />
    <TxButton label="Post Reserve" loadingLabel="Posting…" onclick={handlePostReserve} disabled={!reserveAmount} />
  </section>

  <section class="card">
    <div class="card-title">COMPOSITION (LATEST PER ASSET)</div>
    {#if loading}
      <p class="muted">AWAITING DATA</p>
    {:else if composition().length === 0}
      <p class="muted">NO RESERVE DATA</p>
    {:else}
      <div class="composition">
        {#each composition() as [type, amount]}
          {@const pct = totalReserves > 0n ? Number((amount * 10000n) / totalReserves) / 100 : 0}
          <div class="comp-row">
            <div class="comp-top">
              <span class="comp-type">{type}</span>
              <span class="comp-right">
                <span class="comp-amt">{fmtUSD(amount)}</span>
                <span class="comp-pct">{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div class="comp-bar-track">
              <div class="comp-bar-fill" style="width: {pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<section class="card" style="margin-top: 1.5rem;">
  <div class="card-title">RESERVE HISTORY</div>
  <div class="table">
    <div class="table-header">
      <span>DATE</span><span>ASSET TYPE</span><span class="right">AMOUNT</span><span>REPORTER</span>
    </div>
    {#if loading}
      <div class="table-empty">AWAITING DATA</div>
    {:else if history.length === 0}
      <div class="table-empty">NO ENTRIES FOUND</div>
    {:else}
      {#each history as e}
        <div class="table-row">
          <span class="mono">{fmtTime(e.timestamp)}</span>
          <span>{e.assetType}</span>
          <span class="right mono">{fmtUSD(e.amount)}</span>
          <span class="mono addr">{e.reporter.slice(0, 6)}...{e.reporter.slice(-4)}</span>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .back {
    font-size: 0.75rem;
    color: var(--muted);
    letter-spacing: 0.08em;
  }
  .back:hover { color: var(--text); }

  .page-header {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
    margin: 0.5rem 0 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .prompt { color: var(--accent); }
  .line { flex: 1; height: 1px; background: var(--border); margin-left: 0.5rem; }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #1a1a1a;
  }
  .stat { display: flex; flex-direction: column; }
  .stat-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.1em;
  }
  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 0.25rem;
    font-family: var(--font-mono);
  }
  .stat-value.healthy { color: var(--accent); }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .card {
    border: 1px solid var(--border);
    border-radius: 1px;
    padding: 1.5rem;
    background: var(--surface-alt);
  }
  .card-title {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--muted);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  label {
    display: block;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    margin: 0.75rem 0 0.25rem;
  }
  input, select {
    width: 100%;
    padding: 0.6rem;
    border: 1px solid #222;
    border-radius: 0;
    background: #000;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    box-sizing: border-box;
    margin-bottom: 0.25rem;
  }
  input:focus, select:focus { outline: none; border-color: #444; }
  input::placeholder { color: var(--muted-dim); }
  select option { background: #111; color: var(--text); }

  .composition { display: flex; flex-direction: column; gap: 0.75rem; }
  .comp-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .comp-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .comp-right { display: flex; gap: 0.75rem; align-items: baseline; }
  .comp-type { font-size: 0.8rem; letter-spacing: 0.05em; color: var(--text); }
  .comp-amt { font-family: var(--font-mono); font-weight: 500; font-size: 0.85rem; }
  .comp-pct { color: var(--muted); font-size: 0.75rem; font-family: var(--font-mono); min-width: 2.5rem; text-align: right; }
  .comp-bar-track {
    height: 3px;
    background: var(--border);
    border-radius: 1px;
    overflow: hidden;
  }
  .comp-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 1px;
    transition: width 0.3s ease;
    min-width: 2px;
  }
  .muted { color: var(--muted-dim); font-size: 0.75rem; letter-spacing: 0.1em; }

  .table { width: 100%; }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1.5fr;
    padding: 0.4rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1.5fr;
    padding: 0.6rem 0;
    font-size: 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
    transition: background 0.1s;
  }
  .table-row:hover { background: var(--surface); }
  .table-empty {
    padding: 2rem;
    text-align: center;
    color: var(--muted-dim);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
  }
  .mono { font-family: var(--font-mono); }
  .addr { color: var(--muted); }
  .right { text-align: right; }
</style>
