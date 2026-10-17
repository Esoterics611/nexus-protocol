<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import TxButton from "$lib/components/TxButton.svelte";
  import { page } from "$app/state";
  import { address as walletAddress, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getVault, getStablecoin, getSwapGateway, isGatewayDeployed } from "$lib/contracts";
  import { getNavHistory, fmtTimestamp, fmtAssetStr, indexerOnline, type NavHistoryEntry } from "$lib/api/indexer";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";
  import { formatEther, parseEther } from "viem";

  let depositAmount = $state("");
  let withdrawAmount = $state("");
  let buyEthAmount = $state("");
  let sellSharesAmount = $state("");
  let activeTab: "deposit" | "withdraw" | "buy" | "sell" = $state("deposit");
  const gatewayDeployed = isGatewayDeployed();

  // Vault data
  let vaultName = $state("—");
  let vaultSymbol = $state("—");
  let totalAssets = $state(0n);
  let totalSupply = $state(0n);
  let userShares = $state(0n);
  let userValue = $state(0n);
  let userNUSD = $state(0n);
  let userETH = $state(0n);
  let depositPreview = $state(0n);
  let withdrawPreview = $state(0n);
  let buyEthPreview = $state(0n);   // estimated shares from ETH
  let sellSharesPreview = $state(0n); // estimated ETH from shares
  let ethPrice = $state(0n);
  let loading = $state(true);
  let navHistory = $state<NavHistoryEntry[]>([]);
  let navLoading = $state(false);

  const vaultAddr = $derived(page.params.address as `0x${string}`);

  function sharePrice() {
    if (totalSupply === 0n) return "$1.0000";
    const p = (totalAssets * 1_000_000n) / totalSupply;
    return "$" + (Number(p) / 1_000_000).toFixed(4);
  }

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  async function loadVault() {
    loading = true;
    try {
      const vault = getVault(vaultAddr, publicClient);
      const [name, sym, assets, supply] = await Promise.all([
        vault.read.name(),
        vault.read.symbol(),
        vault.read.totalAssets(),
        vault.read.totalSupply(),
      ]);
      vaultName = name;
      vaultSymbol = sym;
      totalAssets = assets;
      totalSupply = supply;

      const acc = get(walletAddress);
      if (acc) {
        const stablecoin = getStablecoin(publicClient);
        [userShares, userNUSD] = await Promise.all([
          vault.read.balanceOf([acc]),
          stablecoin.read.balanceOf([acc]),
        ]);
        userValue = userShares > 0n ? await vault.read.convertToAssets([userShares]) : 0n;
        userETH = await publicClient.getBalance({ address: acc });

        if (gatewayDeployed) {
          try {
            const gw = getSwapGateway(publicClient);
            ethPrice = await gw.read.ethPrice();
          } catch { ethPrice = 0n; }
        }
      }
    } catch {
      // node unavailable
    }
    loading = false;
  }

  let _poll: ReturnType<typeof setInterval>;

  onMount(() => {
    loadVault();
    loadNavHistory();
    _poll = setInterval(() => {
      loadVault();
      // Only re-poll indexer if it was reachable last time (avoid console spam)
      if (indexerOnline || navHistory.length === 0) loadNavHistory();
    }, 12_000);
  });

  onDestroy(() => clearInterval(_poll));

  $effect(() => {
    if ($walletAddress) loadVault();
  });

  async function loadNavHistory() {
    navLoading = true;
    navHistory = await getNavHistory(vaultAddr, 30);
    navLoading = false;
  }

  // Debounced preview for deposit
  let _depTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const val = depositAmount;
    clearTimeout(_depTimer);
    if (!val || isNaN(parseFloat(val))) { depositPreview = 0n; return; }
    _depTimer = setTimeout(async () => {
      try {
        const vault = getVault(vaultAddr, publicClient);
        depositPreview = await vault.read.previewDeposit([parseNUSD(val)]);
      } catch { depositPreview = 0n; }
    }, 300);
  });

  // Debounced preview for withdraw
  let _wdTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const val = withdrawAmount;
    clearTimeout(_wdTimer);
    if (!val || isNaN(parseFloat(val))) { withdrawPreview = 0n; return; }
    _wdTimer = setTimeout(async () => {
      try {
        const vault = getVault(vaultAddr, publicClient);
        withdrawPreview = await vault.read.previewWithdraw([parseNUSD(val)]);
      } catch { withdrawPreview = 0n; }
    }, 300);
  });

  // ---- Write functions ----

  async function handleDeposit() {
    const wc = get(walletClient);
    const acc = get(walletAddress);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const amount = parseNUSD(depositAmount);
    if (amount === 0n) throw new Error("Enter an amount");

    const stablecoin = getStablecoin(wc);
    const vault = getVault(vaultAddr, wc);

    // Step 1: approve
    const approveTx = await stablecoin.write.approve([vaultAddr, amount]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Step 2: deposit
    const depositTx = await vault.write.deposit([amount, acc]);
    await publicClient.waitForTransactionReceipt({ hash: depositTx });

    depositAmount = "";
    await loadVault();
  }

  async function handleWithdraw() {
    const wc = get(walletClient);
    const acc = get(walletAddress);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const amount = parseNUSD(withdrawAmount);
    if (amount === 0n) throw new Error("Enter an amount");

    const vault = getVault(vaultAddr, wc);
    const tx = await vault.write.withdraw([amount, acc, acc]);
    await publicClient.waitForTransactionReceipt({ hash: tx });

    withdrawAmount = "";
    await loadVault();
  }

  // Debounced preview: ETH → vault shares
  let _buyEthTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const val = buyEthAmount;
    clearTimeout(_buyEthTimer);
    if (!val || isNaN(parseFloat(val)) || !gatewayDeployed) { buyEthPreview = 0n; return; }
    _buyEthTimer = setTimeout(async () => {
      try {
        const gw = getSwapGateway(publicClient);
        const nusd = await gw.read.quoteBuyNUSD([parseEther(String(val))]);
        const vault = getVault(vaultAddr, publicClient);
        buyEthPreview = await vault.read.previewDeposit([nusd]);
      } catch { buyEthPreview = 0n; }
    }, 300);
  });

  // Debounced preview: shares → ETH
  let _sellSharesTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const val = sellSharesAmount;
    clearTimeout(_sellSharesTimer);
    if (!val || isNaN(parseFloat(val)) || !gatewayDeployed) { sellSharesPreview = 0n; return; }
    _sellSharesTimer = setTimeout(async () => {
      try {
        const gw = getSwapGateway(publicClient);
        const vault = getVault(vaultAddr, publicClient);
        const nusd = await vault.read.previewRedeem([parseNUSD(val)]);
        sellSharesPreview = await gw.read.quoteSellNUSD([nusd]);
      } catch { sellSharesPreview = 0n; }
    }, 300);
  });

  async function handleBuyWithETH() {
    const wc = get(walletClient);
    const acc = get(walletAddress);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const ethWei = parseEther(String(buyEthAmount));
    if (ethWei === 0n) throw new Error("Enter an amount");

    const gw = getSwapGateway(wc);
    const tx = await gw.write.buyVaultShares([vaultAddr, 0n], { value: ethWei });
    await publicClient.waitForTransactionReceipt({ hash: tx });

    buyEthAmount = "";
    await loadVault();
  }

  async function handleSellForETH() {
    const wc = get(walletClient);
    const acc = get(walletAddress);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const shares = parseNUSD(sellSharesAmount);
    if (shares === 0n) throw new Error("Enter an amount");

    const vault = getVault(vaultAddr, wc);
    const gw = getSwapGateway(wc);

    // Approve gateway to spend vault shares
    const approveTx = await vault.write.approve([gw.address, shares]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    const redeemTx = await gw.write.sellVaultShares([vaultAddr, shares, 0n]);
    await publicClient.waitForTransactionReceipt({ hash: redeemTx });

    sellSharesAmount = "";
    await loadVault();
  }
</script>

<a href="/vaults" class="back">← VAULTS</a>

<div class="vault-title">
  <h1>{loading ? "LOADING..." : vaultName.toUpperCase()}</h1>
  <span class="symbol">{vaultSymbol}</span>
</div>

<div class="split-layout">
  <div class="left-panel">
    <div class="stats-row">
      <StatCard label="Share Price" value={sharePrice()} />
      <StatCard label="TVL" value={fmtUSD(totalAssets)} />
      <StatCard label="Total Shares" value={totalSupply === 0n ? "0" : Number(formatNUSD(totalSupply)).toLocaleString()} />
    </div>

    <div class="nav-section">
      <div class="section-label">NAV HISTORY</div>
      <div class="nav-table">
        <div class="nav-header">
          <span>DATE</span>
          <span class="right">TOTAL ASSETS</span>
          <span>REPORTER</span>
          <span>TX</span>
        </div>
        {#if navLoading}
          <div class="nav-empty">LOADING…</div>
        {:else if navHistory.length === 0}
          <div class="nav-empty">NO NAV HISTORY — INDEXER OFFLINE OR NO REPORTS YET</div>
        {:else}
          {#each navHistory as entry}
            <div class="nav-row">
              <span class="mono dim">{fmtTimestamp(entry.reportedTimestamp)}</span>
              <span class="right mono">{fmtAssetStr(entry.totalAssets)}</span>
              <span class="mono addr">{entry.reporter.slice(0, 6)}…{entry.reporter.slice(-4)}</span>
              <a
                href="https://sepolia.basescan.org/tx/{entry.txHash}"
                target="_blank"
                rel="noopener"
                class="tx-link"
              >↗</a>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    {#if $connected}
      <div class="position-section">
        <div class="section-label">YOUR POSITION</div>
        <div class="position-grid">
          <div class="pos-item">
            <span class="pos-label">SHARES</span>
            <span class="pos-value">{formatNUSD(userShares)} {vaultSymbol}</span>
          </div>
          <div class="pos-item">
            <span class="pos-label">VALUE</span>
            <span class="pos-value">{fmtUSD(userValue)} NUSD</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="right-panel">
    {#if $connected}
      <div class="action-card">
        <div class="tab-strip">
          <button class:active={activeTab === "deposit"} onclick={() => (activeTab = "deposit")}>DEPOSIT</button>
          <button class:active={activeTab === "withdraw"} onclick={() => (activeTab = "withdraw")}>WITHDRAW</button>
          {#if gatewayDeployed}
            <button class:active={activeTab === "buy"} onclick={() => (activeTab = "buy")}>BUY ETH</button>
            <button class:active={activeTab === "sell"} onclick={() => (activeTab = "sell")}>SELL ETH</button>
          {/if}
        </div>

        {#if activeTab === "deposit"}
          <div class="action-form">
            <div class="field-row">
              <label>AMOUNT (NUSD)</label>
              <span class="balance-hint">AVAILABLE: <span class="accent">{formatNUSD(userNUSD)} NUSD</span></span>
            </div>
            <input type="number" bind:value={depositAmount} placeholder="0.00" min="0" />
            <p class="preview">YOU RECEIVE: ~{depositPreview > 0n ? formatNUSD(depositPreview) : "0"} shares</p>
            <TxButton
              label="Approve & Deposit"
              loadingLabel="Depositing…"
              onclick={handleDeposit}
              disabled={!depositAmount}
            />
          </div>
        {:else if activeTab === "withdraw"}
          <div class="action-form">
            <label>AMOUNT (NUSD TO WITHDRAW)</label>
            <input type="number" bind:value={withdrawAmount} placeholder="0.00" min="0" />
            <p class="preview">SHARES BURNED: ~{withdrawPreview > 0n ? formatNUSD(withdrawPreview) : "0"}</p>
            <TxButton
              label="Withdraw"
              loadingLabel="Withdrawing…"
              onclick={handleWithdraw}
              disabled={!withdrawAmount}
            />
          </div>
        {:else if activeTab === "buy"}
          <div class="action-form">
            <div class="field-row">
              <label>AMOUNT (ETH)</label>
              <span class="balance-hint">AVAILABLE: <span class="accent">{parseFloat(formatEther(userETH)).toFixed(4)} ETH</span></span>
            </div>
            <input type="number" bind:value={buyEthAmount} placeholder="0.00" min="0" step="0.001" />
            {#if ethPrice > 0n}
              <p class="preview rate-hint">1 ETH = ${(Number(ethPrice) / 1e8).toLocaleString()} NUSD</p>
            {/if}
            <p class="preview">YOU RECEIVE: ~{buyEthPreview > 0n ? formatNUSD(buyEthPreview) : "0"} {vaultSymbol} shares</p>
            <TxButton
              label="Buy Shares with ETH"
              loadingLabel="Buying…"
              onclick={handleBuyWithETH}
              disabled={!buyEthAmount}
            />
          </div>
        {:else if activeTab === "sell"}
          <div class="action-form">
            <div class="field-row">
              <label>SHARES TO SELL</label>
              <span class="balance-hint">AVAILABLE: <span class="accent">{formatNUSD(userShares)} {vaultSymbol}</span></span>
            </div>
            <input type="number" bind:value={sellSharesAmount} placeholder="0.00" min="0" />
            <p class="preview">YOU RECEIVE: ~{sellSharesPreview > 0n ? parseFloat(formatEther(sellSharesPreview)).toFixed(6) : "0"} ETH</p>
            <TxButton
              label="Approve & Sell for ETH"
              loadingLabel="Selling…"
              onclick={handleSellForETH}
              disabled={!sellSharesAmount}
            />
          </div>
        {/if}
      </div>
    {:else}
      <div class="connect-hint">CONNECT WALLET TO DEPOSIT OR WITHDRAW</div>
    {/if}
  </div>
</div>

<style>
  .back {
    font-size: 0.75rem;
    color: var(--muted);
    letter-spacing: 0.08em;
  }
  .back:hover { color: var(--text); }

  .vault-title {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin: 1rem 0 1.5rem;
  }
  h1 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    font-family: var(--font-mono);
  }
  .symbol { color: var(--muted); font-family: var(--font-mono); font-size: 0.8rem; }

  .split-layout {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 2rem;
  }

  .stats-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .nav-section {
    margin-bottom: 1.5rem;
  }
  .nav-table { width: 100%; }
  .nav-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1.5rem;
    padding: 0.4rem 0;
    color: #777;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--border-subtle);
  }
  .nav-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1.5rem;
    padding: 0.5rem 0;
    font-size: 0.8rem;
    border-bottom: 1px solid var(--border-subtle);
    align-items: center;
  }
  .nav-empty {
    padding: 1.5rem;
    text-align: center;
    color: #888;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
  }
  .addr { color: #777; }
  .tx-link {
    color: #888;
    font-size: 0.75rem;
    text-align: right;
    transition: color 0.15s;
  }
  .tx-link:hover { color: var(--text); }

  .section-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .position-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .pos-item { display: flex; flex-direction: column; }
  .pos-label { color: var(--muted); font-size: 0.7rem; letter-spacing: 0.1em; }
  .pos-value { font-size: 1rem; margin-top: 0.25rem; font-family: var(--font-mono); }

  .action-card {
    border: 1px solid var(--border);
    border-radius: 1px;
    background: var(--surface-alt);
    padding: 0;
  }

  .tab-strip {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .tab-strip button {
    flex: 1;
    padding: 0.75rem;
    background: transparent;
    border: none;
    color: #777;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    border-bottom: 2px solid transparent;
    transition: color 0.15s;
  }
  .tab-strip button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .tab-strip button:hover:not(.active) { color: #888; }

  .action-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .field-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .balance-hint {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.05em;
  }
  .accent { color: var(--accent); }
  label {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  input {
    padding: 0.75rem;
    border: 1px solid #222;
    border-radius: 0;
    background: #000;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus {
    outline: none;
    border-color: #444;
  }
  input::placeholder { color: var(--muted-dim); }
  .preview {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 0.25rem 0 0.5rem;
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
  }
  .connect-hint {
    color: var(--muted-dim);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 3rem 1rem;
    border: 1px solid var(--border);
    border-radius: 1px;
    background: var(--surface-alt);
  }
</style>
