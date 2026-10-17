<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import TxButton from "$lib/components/TxButton.svelte";
  import { address, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getETFWrapper, getStablecoin, getVault, getAddresses } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";

  const addr = getAddresses();

  // Protocol state
  let etfName       = $state("—");
  let etfSymbol     = $state("—");
  let totalNAV      = $state(0n);
  let pricePerToken = $state(0n);
  let totalSupply   = $state(0n);
  let allocations   = $state<{ vault: string; weightBps: bigint; vaultName: string }[]>([]);

  // User
  let userBalance = $state(0n);
  let nusdBalance = $state(0n);

  // Form inputs
  let depositAmt  = $state("");
  let withdrawAmt = $state("");

  let loading = $state(true);

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  async function load() {
    try {
      const etf = getETFWrapper(publicClient);

      const [name, symbol, nav, ppt, supply, count] = await Promise.all([
        etf.read.name(),
        etf.read.symbol(),
        etf.read.totalNAV(),
        etf.read.pricePerToken(),
        etf.read.totalSupply(),
        etf.read.allocationCount(),
      ]);

      etfName = name;
      etfSymbol = symbol;
      totalNAV = nav;
      pricePerToken = ppt;
      totalSupply = supply;

      // Load vault allocations
      const allocs = [];
      for (let i = 0; i < Number(count); i++) {
        const [vaultAddr, weightBps] = await etf.read.allocations([BigInt(i)]);
        const vault = getVault(vaultAddr, publicClient);
        const vaultName = await vault.read.name();
        allocs.push({ vault: vaultAddr, weightBps, vaultName });
      }
      allocations = allocs;

      const acc = get(address);
      if (acc) {
        const nusd = getStablecoin(publicClient);
        const [etfBal, nusdBal] = await Promise.all([
          etf.read.balanceOf([acc]),
          nusd.read.balanceOf([acc]),
        ]);
        userBalance = etfBal;
        nusdBalance = nusdBal;
      }
    } catch {
      // node unavailable
    }
    loading = false;
  }

  $effect(() => { if ($connected) load(); else { userBalance = 0n; nusdBalance = 0n; } });

  let _poll: ReturnType<typeof setInterval>;
  onMount(() => {
    load();
    _poll = setInterval(load, 12_000);
  });
  onDestroy(() => clearInterval(_poll));

  async function handleDeposit() {
    const wc = get(walletClient);
    const acc = get(address);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const nusdAmt = parseNUSD(depositAmt);
    // Approve NUSD to ETF
    const nusd = getStablecoin(wc);
    const approveTx = await nusd.write.approve([addr.etfWrapper as `0x${string}`, nusdAmt]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const etf = getETFWrapper(wc);
    const tx = await etf.write.deposit([nusdAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    depositAmt = "";
    await load();
  }

  async function handleWithdraw() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const etfAmt = parseNUSD(withdrawAmt);
    const etf = getETFWrapper(wc);
    const tx = await etf.write.withdraw([etfAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    withdrawAmt = "";
    await load();
  }
</script>

<div class="page-header">
  <span class="prompt">></span> ETF WRAPPER — {etfName}
</div>

<div class="stats-row">
  <StatCard label="Token" value={etfSymbol} />
  <StatCard label="Total NAV" value={fmtUSD(totalNAV)} />
  <StatCard label="Price / Token" value={pricePerToken > 0n ? "$" + Number(formatNUSD(pricePerToken)).toFixed(4) : "—"} />
  <StatCard label="Total Supply" value={Number(formatNUSD(totalSupply)).toLocaleString()} />
</div>

{#if $connected}
  <div class="section">
    <div class="section-label">YOUR POSITION</div>
    <div class="pos-grid">
      <div class="pos-item">
        <span class="pos-label">{etfSymbol} BALANCE</span>
        <span class="pos-val mono">{Number(formatNUSD(userBalance)).toLocaleString()}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">POSITION VALUE</span>
        <span class="pos-val mono">
          {pricePerToken > 0n
            ? fmtUSD(userBalance * pricePerToken / 1_000_000n)
            : "—"}
        </span>
      </div>
      <div class="pos-item">
        <span class="pos-label">NUSD BALANCE</span>
        <span class="pos-val mono">{fmtUSD(nusdBalance)}</span>
      </div>
    </div>
  </div>
{/if}

<div class="layout">
  <!-- Left: Vault Composition -->
  <div class="composition">
    <div class="section-label">VAULT COMPOSITION</div>
    {#if allocations.length === 0}
      <div class="empty-alloc">No allocations</div>
    {:else}
      {#each allocations as alloc}
        <div class="alloc-row">
          <div class="alloc-info">
            <span class="alloc-name">{alloc.vaultName}</span>
            <span class="alloc-addr mono muted">{alloc.vault.slice(0, 8)}…{alloc.vault.slice(-6)}</span>
          </div>
          <div class="alloc-weight-col">
            <span class="alloc-pct">{(Number(alloc.weightBps) / 100).toFixed(0)}%</span>
            <div class="weight-bar">
              <div class="weight-fill" style="width: {Number(alloc.weightBps) / 100}%"></div>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Right: Actions -->
  <div class="actions">
    <div class="action-card">
      <div class="action-title">DEPOSIT</div>
      <p class="action-desc">
        Deposit NUSD → receive {etfSymbol} tokens. NUSD is split across vaults per allocation weights.
      </p>
      <div class="form-group">
        <label class="form-label">NUSD TO DEPOSIT</label>
        <input class="input" placeholder="0.000000" bind:value={depositAmt} />
        {#if $connected && nusdBalance > 0n}
          <button class="max-btn" onclick={() => { depositAmt = formatNUSD(nusdBalance); }}>MAX</button>
        {/if}
      </div>
      <TxButton
        label="Approve & Deposit"
        loadingLabel="Depositing…"
        onclick={handleDeposit}
        disabled={!$connected || !depositAmt || depositAmt === "0"}
      />
    </div>

    <div class="action-card">
      <div class="action-title">WITHDRAW</div>
      <p class="action-desc">
        Burn {etfSymbol} tokens → receive NUSD. Pro-rata redemption from each vault.
      </p>
      <div class="form-group">
        <label class="form-label">{etfSymbol} TO WITHDRAW</label>
        <input class="input" placeholder="0.000000" bind:value={withdrawAmt} />
        {#if $connected && userBalance > 0n}
          <button class="max-btn" onclick={() => { withdrawAmt = formatNUSD(userBalance); }}>MAX</button>
        {/if}
      </div>
      <TxButton
        label="Approve & Withdraw"
        loadingLabel="Withdrawing…"
        onclick={handleWithdraw}
        disabled={!$connected || !withdrawAmt || withdrawAmt === "0" || userBalance === 0n}
      />
    </div>
  </div>
</div>

{#if !$connected}
  <div class="empty-state">CONNECT WALLET TO INTERACT</div>
{/if}

<style>
  .page-header {
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin-bottom: 1.5rem;
  }
  .prompt { color: var(--accent); }

  .stats-row { display: flex; gap: 1rem; margin-bottom: 2rem; }

  .section { margin-bottom: 2rem; }
  .section-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 1rem;
  }

  .pos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
  .pos-item { display: flex; flex-direction: column; gap: 0.25rem; }
  .pos-label { font-size: 0.65rem; color: #666; letter-spacing: 0.1em; }
  .pos-val { font-size: 0.9rem; color: var(--text); }
  .mono { font-family: var(--font-mono); }
  .muted { color: var(--muted); }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  .composition {
    border: 1px solid var(--border-subtle);
    padding: 1.25rem;
    background: var(--surface);
  }

  .empty-alloc {
    font-size: 0.75rem;
    color: #666;
    padding: 1rem 0;
  }

  .alloc-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .alloc-row:last-child { border-bottom: none; }

  .alloc-info { display: flex; flex-direction: column; gap: 0.2rem; }
  .alloc-name { font-size: 0.8rem; color: var(--text); }
  .alloc-addr { font-size: 0.65rem; }

  .alloc-weight-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    min-width: 80px;
  }
  .alloc-pct {
    font-family: var(--font-mono);
    font-size: 0.85rem;
    color: var(--accent);
  }
  .weight-bar {
    width: 80px;
    height: 4px;
    background: #222;
    border-radius: 2px;
  }
  .weight-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .action-card {
    border: 1px solid var(--border-subtle);
    padding: 1.25rem;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .action-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  .action-desc {
    font-size: 0.72rem;
    color: var(--muted);
    line-height: 1.5;
    margin: 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .form-label { font-size: 0.65rem; color: #666; letter-spacing: 0.1em; }

  .input {
    background: #111;
    border: 1px solid #333;
    color: var(--text);
    padding: 0.5rem 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.85rem;
    width: 100%;
    box-sizing: border-box;
    outline: none;
  }
  .input:focus { border-color: #555; }

  .max-btn {
    align-self: flex-end;
    font-size: 0.65rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    letter-spacing: 0.08em;
    margin-top: -0.25rem;
  }

  .empty-state {
    color: #666;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 4rem;
  }
</style>
