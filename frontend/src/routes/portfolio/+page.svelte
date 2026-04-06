<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import { address, connected, publicClient, formatNUSD } from "$lib/stores/wallet";
  import { getStablecoin, getVaultFactory, getVault } from "$lib/contracts";
  import { getVaultTransactions, fmtTimestamp, fmtAssetStr, indexerOnline, type VaultTransaction } from "$lib/api/indexer";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";

  interface Position {
    vaultAddress: `0x${string}`;
    name: string;
    symbol: string;
    shares: bigint;
    value: bigint;
  }

  let nusdBalance = $state(0n);
  let positions = $state<Position[]>([]);
  let txHistory = $state<VaultTransaction[]>([]);
  let loading = $state(false);
  let txLoading = $state(false);
  // Map vault address → name for tx history display
  let vaultNames = $state<Record<string, string>>({});

  function totalValue() {
    return positions.reduce((acc, p) => acc + p.value, nusdBalance);
  }

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  async function load(acc: `0x${string}`) {
    loading = true;
    try {
      const stablecoin = getStablecoin(publicClient);
      const factory = getVaultFactory(publicClient);

      const [bal, count] = await Promise.all([
        stablecoin.read.balanceOf([acc]),
        factory.read.getVaultCount(),
      ]);
      nusdBalance = bal;

      const pos: Position[] = [];
      const names: Record<string, string> = {};
      for (let i = 0; i < Number(count); i++) {
        const vaultAddr = await factory.read.getVault([BigInt(i)]);
        const vault = getVault(vaultAddr, publicClient);
        const [shares, name, symbol] = await Promise.all([
          vault.read.balanceOf([acc]),
          vault.read.name(),
          vault.read.symbol(),
        ]);
        names[vaultAddr.toLowerCase()] = name;
        if (shares > 0n) {
          const value = await vault.read.convertToAssets([shares]);
          pos.push({ vaultAddress: vaultAddr, name, symbol, shares, value });
        }
      }
      positions = pos;
      vaultNames = names;
    } catch {
      // node unavailable
    }
    loading = false;

    // Load tx history from indexer (non-blocking, skip if known offline to avoid console spam)
    if (indexerOnline || txHistory.length === 0) loadTxHistory(acc);
  }

  async function loadTxHistory(acc: `0x${string}`) {
    txLoading = true;
    txHistory = await getVaultTransactions({ owner: acc, limit: 50 });
    txLoading = false;
  }

  $effect(() => {
    if ($address) load($address);
    else { nusdBalance = 0n; positions = []; txHistory = []; }
  });

  let _poll: ReturnType<typeof setInterval>;

  onMount(() => {
    _poll = setInterval(() => {
      const acc = get(address);
      if (acc) {
        load(acc); // always refresh chain data
        // loadTxHistory is called inside load() — gated by indexerOnline there
      }
    }, 12_000);
  });

  onDestroy(() => clearInterval(_poll));

  function vaultLabel(addr: string) {
    return vaultNames[addr.toLowerCase()] ?? addr.slice(0, 6) + "…" + addr.slice(-4);
  }
</script>

<div class="page-header">
  <span class="prompt">></span> PORTFOLIO
</div>

{#if !$connected}
  <div class="empty-state">CONNECT WALLET TO VIEW PORTFOLIO</div>
{:else if loading}
  <div class="empty-state">AWAITING DATA</div>
{:else}
  <div class="stats-row">
    <StatCard label="Total Value" value={fmtUSD(totalValue())} />
    <StatCard label="NUSD Balance" value={fmtUSD(nusdBalance)} />
    <StatCard label="Vault Positions" value={String(positions.length)} />
  </div>

  <div class="section">
    <div class="section-label">VAULT POSITIONS</div>
    <div class="table">
      <div class="table-header">
        <span>VAULT</span><span>SYMBOL</span><span class="right">SHARES</span><span class="right">VALUE</span>
      </div>
      {#if positions.length === 0}
        <div class="table-empty">NO POSITIONS — DEPOSIT INTO A VAULT TO GET STARTED</div>
      {:else}
        {#each positions as p}
          <a href="/vaults/{p.vaultAddress}" class="table-row">
            <span>{p.name}</span>
            <span class="mono muted">{p.symbol}</span>
            <span class="right mono">{Number(formatNUSD(p.shares)).toLocaleString()}</span>
            <span class="right mono">{fmtUSD(p.value)}</span>
          </a>
        {/each}
      {/if}
    </div>
  </div>

  <div class="section">
    <div class="section-label">TRANSACTION HISTORY</div>
    <div class="table">
      <div class="table-header tx-header">
        <span>DATE</span>
        <span>TYPE</span>
        <span class="right">ASSETS</span>
        <span class="right">SHARES</span>
        <span>VAULT</span>
        <span>TX</span>
      </div>
      {#if txLoading}
        <div class="table-empty">LOADING…</div>
      {:else if txHistory.length === 0}
        <div class="table-empty">
          {#if indexerOnline}
            NO TRANSACTIONS FOUND
          {:else}
            INDEXER OFFLINE — START WITH: docker compose up -d
          {/if}
        </div>
      {:else}
        {#each txHistory as tx}
          <div class="table-row tx-row">
            <span class="mono dim">{fmtTimestamp(tx.blockTimestamp)}</span>
            <span class="type-badge" class:deposit={tx.txType === "deposit"} class:withdraw={tx.txType === "withdraw"}>
              {tx.txType.toUpperCase()}
            </span>
            <span class="right mono">{fmtAssetStr(tx.assets)}</span>
            <span class="right mono dim">{fmtAssetStr(tx.shares)}</span>
            <span class="muted">{vaultLabel(tx.vaultAddress)}</span>
            <a
              href="https://sepolia.basescan.org/tx/{tx.txHash}"
              target="_blank"
              rel="noopener"
              class="tx-link"
              onclick={(e) => e.stopPropagation()}
            >↗</a>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

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

  .section { margin-bottom: 2rem; }
  .section-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
    padding-bottom: 0.5rem;
    margin-bottom: 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .table { width: 100%; }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    padding: 0.4rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .tx-header {
    grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr 1.5rem;
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    padding: 0.6rem 0;
    color: var(--text);
    font-size: 0.875rem;
    border-bottom: 1px solid var(--border-subtle);
    transition: background 0.1s;
  }
  .tx-row {
    grid-template-columns: 2fr 1fr 1fr 1fr 1.5fr 1.5rem;
    align-items: center;
  }
  .table-row:hover { background: var(--surface); }
  .table-empty {
    padding: 2rem;
    text-align: center;
    color: #666;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
  }

  .type-badge {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
  }
  .type-badge.deposit { color: var(--accent); }
  .type-badge.withdraw { color: #888; }

  .tx-link {
    color: #555;
    font-size: 0.75rem;
    text-align: right;
    transition: color 0.15s;
  }
  .tx-link:hover { color: var(--text); }

  .mono { font-family: var(--font-mono); }
  .dim { color: #777; }
  .muted { color: var(--muted); font-size: 0.8rem; }
  .right { text-align: right; }
  .empty-state {
    color: #666;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 4rem;
  }
</style>
