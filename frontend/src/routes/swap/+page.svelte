<script lang="ts">
  import TxButton from "$lib/components/TxButton.svelte";
  import { address as walletAddress, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getStablecoin, getSwapGateway, isGatewayDeployed } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";
  import { formatEther, parseEther } from "viem";

  type SwapDir = "buy" | "sell";

  let dir: SwapDir = $state("buy");
  let amount = $state("");
  let ethPrice = $state(0n);
  let ethReserves = $state(0n);
  let userNUSD = $state(0n);
  let userETH = $state(0n);
  let preview = $state(0n);
  let loading = $state(true);
  const gatewayDeployed = isGatewayDeployed();

  async function loadData() {
    loading = true;
    const acc = get(walletAddress);
    try {
      const gw = getSwapGateway(publicClient);
      [ethPrice, ethReserves] = await Promise.all([
        gw.read.ethPrice(),
        gw.read.ethReserves(),
      ]);
      if (acc) {
        const sc = getStablecoin(publicClient);
        [userNUSD, userETH] = await Promise.all([
          sc.read.balanceOf([acc]),
          publicClient.getBalance({ address: acc }),
        ]);
      }
    } catch { /* node unavailable */ }
    loading = false;
  }

  let _poll: ReturnType<typeof setInterval>;
  onMount(() => {
    if (gatewayDeployed) {
      loadData();
      _poll = setInterval(loadData, 15_000);
    } else {
      loading = false;
    }
  });
  onDestroy(() => clearInterval(_poll));

  $effect(() => { if ($walletAddress) loadData(); });

  // Debounced preview
  let _previewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const val = amount;
    const d = dir;
    clearTimeout(_previewTimer);
    if (!val || isNaN(parseFloat(val)) || ethPrice === 0n) { preview = 0n; return; }
    _previewTimer = setTimeout(async () => {
      try {
        const gw = getSwapGateway(publicClient);
        if (d === "buy") {
          preview = await gw.read.quoteBuyNUSD([parseEther(String(val))]);
        } else {
          preview = await gw.read.quoteSellNUSD([parseNUSD(val)]);
        }
      } catch { preview = 0n; }
    }, 300);
  });

  async function handleSwap() {
    const wc = get(walletClient);
    const acc = get(walletAddress);
    if (!wc || !acc) throw new Error("Wallet not connected");

    const gw = getSwapGateway(wc);

    if (dir === "buy") {
      const ethWei = parseEther(String(amount));
      if (ethWei === 0n) throw new Error("Enter an amount");
      const tx = await gw.write.buyNUSD([0n], { value: ethWei });
      await publicClient.waitForTransactionReceipt({ hash: tx });
    } else {
      const nusdAmt = parseNUSD(amount);
      if (nusdAmt === 0n) throw new Error("Enter an amount");
      const sc = getStablecoin(wc);
      const approveTx = await sc.write.approve([gw.address, nusdAmt]);
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      const tx = await gw.write.sellNUSD([nusdAmt, 0n]);
      await publicClient.waitForTransactionReceipt({ hash: tx });
    }

    amount = "";
    await loadData();
  }

  // Max NUSD sellable = ethReserves * price / 1e20  (same math as contract)
  const maxSellNUSD = $derived(
    ethPrice > 0n && ethReserves > 0n
      ? (ethReserves * ethPrice) / 100_000_000_000_000_000_000n
      : 0n
  );

  const sellExceedsReserves = $derived(
    dir === "sell" &&
    amount !== "" &&
    !isNaN(parseFloat(amount)) &&
    maxSellNUSD > 0n &&
    parseNUSD(amount) > maxSellNUSD
  );

  function setMaxSell() {
    if (maxSellNUSD === 0n) return;
    // Cap at user balance too
    const cap = maxSellNUSD < userNUSD ? maxSellNUSD : userNUSD;
    amount = formatNUSD(cap);
  }

  function fmtEthPrice() {
    if (ethPrice === 0n) return "—";
    return "$" + (Number(ethPrice) / 1e8).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function fmtReserves() {
    if (ethReserves === 0n) return "0 ETH";
    return parseFloat(formatEther(ethReserves)).toFixed(4) + " ETH";
  }
  function fmtMaxSell() {
    if (maxSellNUSD === 0n) return "—";
    return formatNUSD(maxSellNUSD) + " NUSD";
  }
</script>

<div class="page-header">
  <h1>SWAP</h1>
  <p class="subtitle">Exchange ETH for NUSD at the protocol oracle price — no AMM, no slippage fees.</p>
</div>

{#if !gatewayDeployed}
  <div class="not-deployed">
    SWAP GATEWAY NOT DEPLOYED YET.<br />
    Run <code>npx hardhat run scripts/deployGateway.ts --network baseSepolia</code> and update <code>deployments.json</code>.
  </div>
{:else}
  <div class="swap-layout">
    <div class="swap-card">
      <div class="tab-strip">
        <button class:active={dir === "buy"} onclick={() => { dir = "buy"; amount = ""; preview = 0n; }}>BUY NUSD</button>
        <button class:active={dir === "sell"} onclick={() => { dir = "sell"; amount = ""; preview = 0n; }}>SELL NUSD</button>
      </div>

      <div class="swap-form">
        {#if dir === "buy"}
          <div class="field-row">
            <label>YOU PAY (ETH)</label>
            {#if $connected}
              <span class="balance-hint">BAL: <span class="accent">{parseFloat(formatEther(userETH)).toFixed(4)} ETH</span></span>
            {/if}
          </div>
          <input type="number" bind:value={amount} placeholder="0.000" min="0" step="0.001" />
          <div class="arrow">↓</div>
          <label>YOU RECEIVE (NUSD)</label>
          <div class="output-box">
            {preview > 0n ? formatNUSD(preview) : "0.000000"} NUSD
          </div>
        {:else}
          <div class="field-row">
            <label>YOU PAY (NUSD)</label>
            <div class="balance-group">
              {#if $connected}
                <span class="balance-hint">BAL: <span class="accent">{formatNUSD(userNUSD)} NUSD</span></span>
              {/if}
              {#if maxSellNUSD > 0n}
                <button class="max-btn" onclick={setMaxSell}>MAX</button>
              {/if}
            </div>
          </div>
          <input
            type="number"
            bind:value={amount}
            placeholder="0.00"
            min="0"
            class:input-error={sellExceedsReserves}
          />
          {#if sellExceedsReserves}
            <p class="error-hint">EXCEEDS RESERVES — MAX: {fmtMaxSell()}</p>
          {:else if maxSellNUSD > 0n && dir === "sell"}
            <p class="limit-hint">MAX SELLABLE: {fmtMaxSell()}</p>
          {/if}
          <div class="arrow">↓</div>
          <label>YOU RECEIVE (ETH)</label>
          <div class="output-box">
            {preview > 0n ? parseFloat(formatEther(preview)).toFixed(6) : "0.000000"} ETH
          </div>
        {/if}

        {#if $connected}
          <TxButton
            label={dir === "buy" ? "Buy NUSD" : "Approve & Sell NUSD"}
            loadingLabel={dir === "buy" ? "Buying…" : "Selling…"}
            onclick={handleSwap}
            disabled={!amount || sellExceedsReserves}
          />
        {:else}
          <p class="connect-hint">CONNECT WALLET TO SWAP</p>
        {/if}
      </div>
    </div>

    <div class="info-panel">
      <div class="info-section">
        <div class="section-label">ORACLE PRICE</div>
        <div class="info-value accent">{loading ? "…" : fmtEthPrice()}</div>
        <p class="info-note">ETH/USD from mock price feed. Admin-settable for demo.</p>
      </div>
      <div class="info-section">
        <div class="section-label">ETH RESERVES</div>
        <div class="info-value">{loading ? "…" : fmtReserves()}</div>
        <p class="info-note">
          Protocol ETH held for NUSD redemptions.<br />
          Max sellable: <span class="accent">{loading ? "…" : fmtMaxSell()}</span>
        </p>
      </div>
      <div class="info-section">
        <div class="section-label">HOW IT WORKS</div>
        <ul class="how-list">
          <li>Buy NUSD: Send ETH → gateway mints NUSD at oracle price</li>
          <li>Sell NUSD: Approve → gateway burns NUSD → returns ETH</li>
          <li>No AMM, no fees, no price impact</li>
        </ul>
      </div>
    </div>
  </div>
{/if}

<style>
  .page-header {
    margin-bottom: 2rem;
  }
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    font-family: var(--font-mono);
  }
  .subtitle {
    color: var(--muted);
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    margin: 0;
  }

  .not-deployed {
    border: 1px solid var(--border);
    padding: 2rem;
    color: var(--muted);
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    line-height: 1.8;
  }
  code {
    background: #111;
    padding: 0.1em 0.4em;
    font-family: var(--font-mono);
    font-size: 0.85em;
  }

  .swap-layout {
    display: grid;
    grid-template-columns: 420px 1fr;
    gap: 2rem;
    align-items: start;
  }

  .swap-card {
    border: 1px solid var(--border);
    background: var(--surface-alt);
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

  .swap-form {
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
  label {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .balance-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .balance-hint {
    font-size: 0.7rem;
    color: var(--muted);
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
  }
  .max-btn {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    padding: 0.15rem 0.4rem;
    background: transparent;
    border: 1px solid #333;
    color: var(--accent);
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .max-btn:hover { border-color: var(--accent); }
  .input-error { border-color: #c0392b !important; }
  .error-hint {
    color: #e74c3c;
    font-size: 0.7rem;
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
    margin: 0.1rem 0;
  }
  .limit-hint {
    color: var(--muted);
    font-size: 0.7rem;
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
    margin: 0.1rem 0;
  }
  .accent { color: var(--accent); }
  input {
    padding: 0.75rem;
    border: 1px solid #222;
    background: #000;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 1rem;
    width: 100%;
    box-sizing: border-box;
    border-radius: 0;
  }
  input:focus { outline: none; border-color: #444; }
  input::placeholder { color: var(--muted-dim); }

  .arrow {
    text-align: center;
    color: var(--muted);
    font-size: 1.2rem;
    margin: 0.25rem 0;
  }
  .output-box {
    padding: 0.75rem;
    border: 1px solid #1a1a1a;
    background: #080808;
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--accent);
    margin-bottom: 0.5rem;
  }
  .connect-hint {
    color: var(--muted-dim);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 1rem;
    font-family: var(--font-mono);
  }

  .info-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .info-section {}
  .section-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.12em;
    margin-bottom: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .info-value {
    font-family: var(--font-mono);
    font-size: 1.4rem;
    margin-bottom: 0.25rem;
  }
  .info-note {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 0;
    letter-spacing: 0.03em;
  }
  .how-list {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 0.5rem 0 0;
    padding-left: 1.2em;
    line-height: 1.8;
    letter-spacing: 0.03em;
  }
</style>
