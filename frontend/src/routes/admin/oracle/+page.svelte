<script lang="ts">
  import TxButton from "$lib/components/TxButton.svelte";
  import { walletClient, publicClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getNAVOracle } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";

  interface NAVEntry {
    totalAssets: bigint;
    timestamp: bigint;
    reporter: `0x${string}`;
  }

  let latestNAV = $state<{ totalAssets: bigint; timestamp: bigint } | null>(null);
  let history = $state<NAVEntry[]>([]);
  let historyLength = $state(0);
  let loading = $state(true);
  let navAmount = $state("");

  async function load() {
    loading = true;
    try {
      const oracle = getNAVOracle(publicClient);
      const [latest, len] = await Promise.all([
        oracle.read.getLatestNAV(),
        oracle.read.getHistoryLength(),
      ]);
      latestNAV = { totalAssets: latest[0], timestamp: latest[1] };
      historyLength = Number(len);

      const start = Math.max(0, historyLength - 30);
      const entries: NAVEntry[] = [];
      for (let i = historyLength - 1; i >= start; i--) {
        const e = await oracle.read.getNAVAt([BigInt(i)]);
        entries.push(e);
      }
      history = entries;
    } catch {
      // node unavailable
    }
    loading = false;
  }

  let _poll: ReturnType<typeof setInterval>;

  onMount(() => {
    load();
    _poll = setInterval(load, 30_000);
  });

  onDestroy(() => clearInterval(_poll));

  async function handlePostNAV() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!navAmount) throw new Error("Enter total assets amount");
    const oracle = getNAVOracle(wc);
    const ts = BigInt(Math.floor(Date.now() / 1000));
    const tx = await oracle.write.postNAV([parseNUSD(navAmount), ts]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    navAmount = "";
    await load();
  }

  function fmtTime(ts: bigint) {
    return new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16);
  }

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function ageStr(ts: bigint) {
    if (ts === 0n) return "Never posted";
    const seconds = Math.floor(Date.now() / 1000) - Number(ts);
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return h + "h " + m + "m ago";
    }
    return Math.floor(seconds / 86400) + "d ago";
  }

  function pctChange(i: number) {
    if (i >= history.length - 1) return "—";
    const curr = history[i].totalAssets;
    const prev = history[i + 1].totalAssets;
    if (prev === 0n) return "—";
    const pct = Number((curr - prev) * 10000n / prev) / 100;
    return (pct >= 0 ? "+" : "") + pct.toFixed(4) + "%";
  }
</script>

<a href="/admin" class="back">← DASHBOARD</a>
<div class="page-header">
  <span class="prompt">></span> NAV ORACLE <span class="line"></span>
</div>

<div class="grid">
  <section class="card">
    <div class="card-title">LATEST NAV</div>
    {#if loading}
      <p class="muted">AWAITING DATA</p>
    {:else if latestNAV}
      <div class="latest">
        <div class="latest-item"><span class="item-label">TOTAL ASSETS</span><span class="item-value">{fmtUSD(latestNAV.totalAssets)}</span></div>
        <div class="latest-item"><span class="item-label">LAST UPDATED</span><span class="item-value">{fmtTime(latestNAV.timestamp)}</span></div>
        <div class="latest-item"><span class="item-label">AGE</span><span class="item-value">{ageStr(latestNAV.timestamp)}</span></div>
        <div class="latest-item"><span class="item-label">HISTORY ENTRIES</span><span class="item-value">{historyLength}</span></div>
      </div>
    {:else}
      <p class="muted">NO NAV POSTED YET</p>
    {/if}
  </section>

  <section class="card">
    <div class="card-title">POST NAV UPDATE</div>
    <label>TOTAL ASSETS (NUSD)</label>
    <input type="number" bind:value={navAmount} placeholder="1000000.00" />
    <p class="hint">Timestamp: current time (auto-set)</p>
    <TxButton label="Post NAV" loadingLabel="Posting…" onclick={handlePostNAV} disabled={!navAmount} />
  </section>
</div>

<section class="card" style="margin-top: 1.5rem;">
  <div class="card-title">NAV HISTORY (LAST 30)</div>
  <div class="table">
    <div class="table-header">
      <span>DATE</span><span class="right">TOTAL ASSETS</span><span class="right">CHANGE</span><span>REPORTER</span>
    </div>
    {#if loading}
      <div class="table-empty">AWAITING DATA</div>
    {:else if history.length === 0}
      <div class="table-empty">NO ENTRIES FOUND</div>
    {:else}
      {#each history as entry, i}
        <div class="table-row">
          <span class="mono">{fmtTime(entry.timestamp)}</span>
          <span class="right mono">{fmtUSD(entry.totalAssets)}</span>
          <span class="right mono" class:green={pctChange(i).startsWith("+")} class:red={pctChange(i).startsWith("-")}>
            {pctChange(i)}
          </span>
          <span class="mono addr">{entry.reporter.slice(0, 6)}...{entry.reporter.slice(-4)}</span>
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

  .latest { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .latest-item { display: flex; flex-direction: column; }
  .item-label { color: var(--muted); font-size: 0.7rem; letter-spacing: 0.1em; }
  .item-value { font-size: 1rem; margin-top: 0.25rem; font-family: var(--font-mono); }

  label {
    display: block;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    margin-bottom: 0.25rem;
  }
  input {
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
  input:focus { outline: none; border-color: #444; }
  input::placeholder { color: var(--muted-dim); }
  .hint { color: var(--muted); font-size: 0.7rem; margin: 0.25rem 0 0.75rem; letter-spacing: 0.05em; }
  .muted { color: var(--muted-dim); font-size: 0.75rem; letter-spacing: 0.1em; }

  .table { width: 100%; }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1.5fr;
    padding: 0.4rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1.5fr;
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
  .green { color: var(--accent); }
  .red { color: var(--danger); }
</style>
