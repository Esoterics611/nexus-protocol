<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import TxButton from "$lib/components/TxButton.svelte";
  import { address, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getYieldSplitter, getVault, getPrincipalToken, getYieldToken, getAddresses } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";

  const addr = getAddresses();

  // State
  let maturity       = $state(0n);
  let maturityStr    = $state("—");
  let isMatured      = $state(false);
  let splitterShares = $state(0n);  // vault shares held by splitter
  let splitterTVL    = $state(0n);
  let ptSupply       = $state(0n);
  let ytSupply       = $state(0n);

  // User position
  let userVaultShares = $state(0n);
  let userPT          = $state(0n);
  let userYT          = $state(0n);
  let userYTYield     = $state(0n);

  // Form inputs
  let splitAmount  = $state("");
  let unsplitAmt   = $state("");
  let redeemPTAmt  = $state("");
  let redeemYTAmt  = $state("");

  let loading = $state(true);

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function fmtNUSD(v: bigint) {
    return Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  async function load() {
    try {
      const splitter = getYieldSplitter(publicClient);
      const pt = getPrincipalToken(publicClient);
      const yt = getYieldToken(publicClient);
      const vault = getVault(addr.yieldVault as `0x${string}`, publicClient);

      const [mat, shares, ptSup, ytSup] = await Promise.all([
        splitter.read.maturity(),
        splitter.read.totalVaultShares(),
        pt.read.totalSupply(),
        yt.read.totalSupply(),
      ]);

      maturity = mat;
      maturityStr = new Date(Number(mat) * 1000).toLocaleDateString("en-US", { dateStyle: "medium" });
      isMatured = BigInt(Math.floor(Date.now() / 1000)) >= mat;
      splitterShares = shares;
      splitterTVL = await vault.read.convertToAssets([shares]);
      ptSupply = ptSup;
      ytSupply = ytSup;

      const acc = get(address);
      if (acc) {
        const [vShares, ptBal, ytBal, ytYield] = await Promise.all([
          vault.read.balanceOf([acc]),
          pt.read.balanceOf([acc]),
          yt.read.balanceOf([acc]),
          yt.read.yieldOwed([acc]),
        ]);
        userVaultShares = vShares;
        userPT = ptBal;
        userYT = ytBal;
        userYTYield = ytYield;
      }
    } catch {
      // node unavailable
    }
    loading = false;
  }

  $effect(() => { if ($connected) load(); });

  let _poll: ReturnType<typeof setInterval>;
  onMount(() => {
    load();
    _poll = setInterval(load, 12_000);
  });
  onDestroy(() => clearInterval(_poll));

  async function handleSplit() {
    const wc = get(walletClient);
    const acc = get(address);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const shares = parseNUSD(splitAmount);
    // Approve vault shares to splitter
    const vault = getVault(addr.yieldVault as `0x${string}`, wc);
    const approveTx = await vault.write.approve([addr.yieldSplitter as `0x${string}`, shares]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const splitter = getYieldSplitter(wc);
    const tx = await splitter.write.split([shares]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    splitAmount = "";
    await load();
  }

  async function handleUnsplit() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const ptAmt = parseNUSD(unsplitAmt);
    // Approve PT + YT to splitter
    const pt = getPrincipalToken(wc);
    const yt = getYieldToken(wc);
    const splitter = getYieldSplitter(wc);
    const splitterAddr = addr.yieldSplitter as `0x${string}`;
    const maxUint = 2n**256n - 1n;
    await Promise.all([
      (async () => { const tx = await pt.write.approve([splitterAddr, maxUint]); await publicClient.waitForTransactionReceipt({ hash: tx }); })(),
      (async () => { const tx = await yt.write.approve([splitterAddr, maxUint]); await publicClient.waitForTransactionReceipt({ hash: tx }); })(),
    ]);
    const tx = await splitter.write.unsplit([ptAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    unsplitAmt = "";
    await load();
  }

  async function handleRedeemPT() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const ptAmt = parseNUSD(redeemPTAmt);
    const pt = getPrincipalToken(wc);
    const splitter = getYieldSplitter(wc);
    const approveTx = await pt.write.approve([addr.yieldSplitter as `0x${string}`, ptAmt]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const tx = await splitter.write.redeemPT([ptAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    redeemPTAmt = "";
    await load();
  }

  async function handleRedeemYT() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const ytAmt = parseNUSD(redeemYTAmt);
    const yt = getYieldToken(wc);
    const splitter = getYieldSplitter(wc);
    const approveTx = await yt.write.approve([addr.yieldSplitter as `0x${string}`, ytAmt]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const tx = await splitter.write.redeemYT([ytAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    redeemYTAmt = "";
    await load();
  }

  async function handleDistributeYield() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const splitter = getYieldSplitter(wc);
    const tx = await splitter.write.distributeYield();
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await load();
  }
</script>

<div class="page-header">
  <span class="prompt">></span> YIELD SPLITTER
</div>

<div class="stats-row">
  <StatCard label="TVL" value={fmtUSD(splitterTVL)} />
  <StatCard label="PT Supply" value={fmtNUSD(ptSupply)} />
  <StatCard label="YT Supply" value={fmtNUSD(ytSupply)} />
  <StatCard label="Maturity" value={maturityStr} sub={isMatured ? "MATURED" : "ACTIVE"} />
</div>

{#if $connected}
  <div class="section">
    <div class="section-label">YOUR POSITION</div>
    <div class="pos-grid">
      <div class="pos-item">
        <span class="pos-label">VAULT SHARES</span>
        <span class="pos-val mono">{fmtNUSD(userVaultShares)}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">PT BALANCE</span>
        <span class="pos-val mono">{fmtNUSD(userPT)}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">YT BALANCE</span>
        <span class="pos-val mono">{fmtNUSD(userYT)}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">YT YIELD OWED</span>
        <span class="pos-val mono accent">{fmtNUSD(userYTYield)} NUSD</span>
      </div>
    </div>
  </div>
{/if}

<div class="actions-grid">

  {#if !isMatured}
  <!-- SPLIT -->
  <div class="action-card">
    <div class="action-title">SPLIT VAULT SHARES</div>
    <p class="action-desc">Deposit vault shares → receive equal PT + YT</p>
    <div class="form-group">
      <label class="form-label">SHARES TO SPLIT</label>
      <input class="input" placeholder="0.000000" bind:value={splitAmount} />
      {#if $connected && userVaultShares > 0n}
        <button class="max-btn" onclick={() => { splitAmount = formatNUSD(userVaultShares); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Approve & Split"
      loadingLabel="Splitting…"
      onclick={handleSplit}
      disabled={!$connected || !splitAmount || splitAmount === "0"}
    />
  </div>

  <!-- UNSPLIT -->
  <div class="action-card">
    <div class="action-title">UNSPLIT (EXIT EARLY)</div>
    <p class="action-desc">Burn PT + YT → recover vault shares (forfeits accrued yield)</p>
    <div class="form-group">
      <label class="form-label">PT AMOUNT TO UNSPLIT</label>
      <input class="input" placeholder="0.000000" bind:value={unsplitAmt} />
      {#if $connected && userPT > 0n}
        <button class="max-btn" onclick={() => { unsplitAmt = formatNUSD(userPT); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Approve & Unsplit"
      loadingLabel="Unsplitting…"
      onclick={handleUnsplit}
      disabled={!$connected || !unsplitAmt || unsplitAmt === "0"}
    />
  </div>

  <!-- DISTRIBUTE YIELD -->
  <div class="action-card">
    <div class="action-title">DISTRIBUTE YIELD</div>
    <p class="action-desc">Snapshot current NAV delta and credit yield to YT holders. Anyone can call.</p>
    <TxButton
      label="Distribute Yield"
      loadingLabel="Distributing…"
      onclick={handleDistributeYield}
      disabled={!$connected}
    />
  </div>
  {/if}

  {#if isMatured}
  <!-- REDEEM PT -->
  <div class="action-card">
    <div class="action-title">REDEEM PT (MATURED)</div>
    <p class="action-desc">Burn PT → receive NUSD (pro-rata of available assets)</p>
    <div class="form-group">
      <label class="form-label">PT TO REDEEM</label>
      <input class="input" placeholder="0.000000" bind:value={redeemPTAmt} />
      {#if $connected && userPT > 0n}
        <button class="max-btn" onclick={() => { redeemPTAmt = formatNUSD(userPT); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Approve & Redeem PT"
      loadingLabel="Redeeming…"
      onclick={handleRedeemPT}
      disabled={!$connected || !redeemPTAmt || redeemPTAmt === "0"}
    />
  </div>

  <!-- REDEEM YT -->
  <div class="action-card">
    <div class="action-title">REDEEM YT (MATURED)</div>
    <p class="action-desc">Burn YT → receive accrued yield in NUSD</p>
    <div class="form-group">
      <label class="form-label">YT TO REDEEM</label>
      <input class="input" placeholder="0.000000" bind:value={redeemYTAmt} />
      {#if $connected && userYT > 0n}
        <button class="max-btn" onclick={() => { redeemYTAmt = formatNUSD(userYT); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Approve & Redeem YT"
      loadingLabel="Redeeming…"
      onclick={handleRedeemYT}
      disabled={!$connected || !redeemYTAmt || redeemYTAmt === "0"}
    />
  </div>
  {/if}

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
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
  .pos-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .pos-label {
    font-size: 0.65rem;
    color: #666;
    letter-spacing: 0.1em;
  }
  .pos-val {
    font-size: 0.9rem;
    color: var(--text);
  }
  .mono { font-family: var(--font-mono); }
  .accent { color: var(--accent); }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
    color: var(--text);
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
    position: relative;
  }

  .form-label {
    font-size: 0.65rem;
    color: #666;
    letter-spacing: 0.1em;
  }

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
