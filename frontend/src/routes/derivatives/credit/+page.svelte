<script lang="ts">
  import StatCard from "$lib/components/StatCard.svelte";
  import TxButton from "$lib/components/TxButton.svelte";
  import { address, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { getCreditVault, getVault, getStablecoin, getAddresses } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount, onDestroy } from "svelte";

  const addr = getAddresses();

  // Protocol state
  let collateralRatio = $state(0n);
  let liquidationRatio = $state(0n);
  let borrowRate = $state(0n);
  let liquidity = $state(0n);

  // User position
  let userShares      = $state(0n);  // vault shares not yet in credit vault
  let userCollateral  = $state(0n);  // collateral shares in credit vault
  let userDebt        = $state(0n);
  let userLTV         = $state(0n);
  let collateralVal   = $state(0n);

  // Form inputs
  let depositAmt  = $state("");
  let borrowAmt   = $state("");
  let repayAmt    = $state("");
  let withdrawAmt = $state("");

  let loading = $state(true);

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function fmtBps(bps: bigint) {
    return (Number(bps) / 100).toFixed(0) + "%";
  }

  function ltvColor() {
    if (userLTV === 0n) return "";
    if (userLTV >= liquidationRatio) return "danger";
    if (userLTV >= liquidationRatio - 1000n) return "warn";
    return "safe";
  }

  function maxBorrow() {
    if (collateralVal === 0n || collateralRatio === 0n) return 0n;
    return (collateralVal * 10000n) / collateralRatio;
  }

  async function load() {
    try {
      const cv = getCreditVault(publicClient);
      const vault = getVault(addr.yieldVault as `0x${string}`, publicClient);

      const [colRatio, liqRatio, brRate, liq] = await Promise.all([
        cv.read.collateralRatioBps(),
        cv.read.liquidationRatioBps(),
        cv.read.borrowRateBps(),
        cv.read.availableLiquidity(),
      ]);
      collateralRatio = colRatio;
      liquidationRatio = liqRatio;
      borrowRate = brRate;
      liquidity = liq;

      const acc = get(address);
      if (acc) {
        const [pos, ltv, colVal, vShares] = await Promise.all([
          cv.read.positions([acc]),
          cv.read.ltvRatio([acc]),
          cv.read.collateralValue([acc]),
          vault.read.balanceOf([acc]),
        ]);
        userCollateral = pos[0];
        userDebt = pos[1];
        userLTV = ltv;
        collateralVal = colVal;
        userShares = vShares;
      }
    } catch {
      // node unavailable
    }
    loading = false;
  }

  $effect(() => { if ($connected) load(); else { userCollateral = 0n; userDebt = 0n; userLTV = 0n; } });

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
    const shares = parseNUSD(depositAmt);
    const vault = getVault(addr.yieldVault as `0x${string}`, wc);
    const approveTx = await vault.write.approve([addr.creditVault as `0x${string}`, shares]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const cv = getCreditVault(wc);
    const tx = await cv.write.depositCollateral([shares]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    depositAmt = "";
    await load();
  }

  async function handleBorrow() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const cv = getCreditVault(wc);
    const tx = await cv.write.borrow([parseNUSD(borrowAmt)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    borrowAmt = "";
    await load();
  }

  async function handleRepay() {
    const wc = get(walletClient);
    const acc = get(address);
    if (!wc || !acc) throw new Error("Wallet not connected");
    const nusdAmt = parseNUSD(repayAmt);
    const nusd = getStablecoin(wc);
    const approveTx = await nusd.write.approve([addr.creditVault as `0x${string}`, nusdAmt]);
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    const cv = getCreditVault(wc);
    const tx = await cv.write.repay([nusdAmt]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    repayAmt = "";
    await load();
  }

  async function handleWithdraw() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const cv = getCreditVault(wc);
    const tx = await cv.write.withdrawCollateral([parseNUSD(withdrawAmt)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    withdrawAmt = "";
    await load();
  }
</script>

<div class="page-header">
  <span class="prompt">></span> CREDIT VAULT
</div>

<div class="stats-row">
  <StatCard label="Available Liquidity" value={fmtUSD(liquidity)} />
  <StatCard label="Collateral Ratio" value={fmtBps(collateralRatio)} />
  <StatCard label="Liquidation Ratio" value={fmtBps(liquidationRatio)} />
  <StatCard label="Borrow Rate" value={fmtBps(borrowRate) + " APY"} />
</div>

{#if $connected}
  <div class="section">
    <div class="section-label">YOUR POSITION</div>
    <div class="pos-grid">
      <div class="pos-item">
        <span class="pos-label">COLLATERAL (SHARES)</span>
        <span class="pos-val mono">{Number(formatNUSD(userCollateral)).toLocaleString()}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">COLLATERAL VALUE</span>
        <span class="pos-val mono">{fmtUSD(collateralVal)}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">DEBT (NUSD)</span>
        <span class="pos-val mono">{fmtUSD(userDebt)}</span>
      </div>
      <div class="pos-item">
        <span class="pos-label">LTV</span>
        <span class="pos-val mono ltv-val {ltvColor()}">
          {userLTV > 0n ? (Number(userLTV) / 100).toFixed(1) + "%" : "—"}
        </span>
      </div>
    </div>

    {#if userLTV >= liquidationRatio && userLTV > 0n}
      <div class="warning">⚠ POSITION IS UNDERCOLLATERALIZED — REPAY DEBT OR ADD COLLATERAL IMMEDIATELY</div>
    {:else if userLTV >= liquidationRatio - 1000n && userLTV > 0n}
      <div class="caution">⚠ LTV APPROACHING LIQUIDATION THRESHOLD — CONSIDER REDUCING EXPOSURE</div>
    {/if}

    <div class="section-sub">Max Borrow: {fmtUSD(maxBorrow())} · Vault Shares Available: {Number(formatNUSD(userShares)).toLocaleString()}</div>
  </div>
{/if}

<div class="actions-grid">
  <div class="action-card">
    <div class="action-title">DEPOSIT COLLATERAL</div>
    <p class="action-desc">Lock vault shares as collateral to enable borrowing</p>
    <div class="form-group">
      <label class="form-label">VAULT SHARES</label>
      <input class="input" placeholder="0.000000" bind:value={depositAmt} />
      {#if $connected && userShares > 0n}
        <button class="max-btn" onclick={() => { depositAmt = formatNUSD(userShares); }}>MAX</button>
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
    <div class="action-title">BORROW NUSD</div>
    <p class="action-desc">Borrow NUSD against your collateral (max {collateralRatio > 0n ? fmtBps(10000n * 10000n / collateralRatio) : "—"} of collateral value)</p>
    <div class="form-group">
      <label class="form-label">NUSD TO BORROW</label>
      <input class="input" placeholder="0.000000" bind:value={borrowAmt} />
      {#if $connected && maxBorrow() > userDebt}
        <button class="max-btn" onclick={() => { borrowAmt = formatNUSD(maxBorrow() - userDebt); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Borrow"
      loadingLabel="Borrowing…"
      onclick={handleBorrow}
      disabled={!$connected || !borrowAmt || borrowAmt === "0" || userCollateral === 0n}
    />
  </div>

  <div class="action-card">
    <div class="action-title">REPAY DEBT</div>
    <p class="action-desc">Repay NUSD debt — reduces your LTV and frees up collateral</p>
    <div class="form-group">
      <label class="form-label">NUSD TO REPAY</label>
      <input class="input" placeholder="0.000000" bind:value={repayAmt} />
      {#if $connected && userDebt > 0n}
        <button class="max-btn" onclick={() => { repayAmt = formatNUSD(userDebt); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Approve & Repay"
      loadingLabel="Repaying…"
      onclick={handleRepay}
      disabled={!$connected || !repayAmt || repayAmt === "0" || userDebt === 0n}
    />
  </div>

  <div class="action-card">
    <div class="action-title">WITHDRAW COLLATERAL</div>
    <p class="action-desc">Recover vault shares — only allowed if position stays collateralized</p>
    <div class="form-group">
      <label class="form-label">SHARES TO WITHDRAW</label>
      <input class="input" placeholder="0.000000" bind:value={withdrawAmt} />
      {#if $connected && userCollateral > 0n && userDebt === 0n}
        <button class="max-btn" onclick={() => { withdrawAmt = formatNUSD(userCollateral); }}>MAX</button>
      {/if}
    </div>
    <TxButton
      label="Withdraw"
      loadingLabel="Withdrawing…"
      onclick={handleWithdraw}
      disabled={!$connected || !withdrawAmt || withdrawAmt === "0" || userCollateral === 0n}
    />
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
  .section-sub {
    font-size: 0.7rem;
    color: #666;
    margin-top: 0.75rem;
    letter-spacing: 0.04em;
  }

  .pos-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  .pos-item { display: flex; flex-direction: column; gap: 0.25rem; }
  .pos-label { font-size: 0.65rem; color: #666; letter-spacing: 0.1em; }
  .pos-val { font-size: 0.9rem; color: var(--text); }
  .mono { font-family: var(--font-mono); }

  .ltv-val.safe { color: var(--accent); }
  .ltv-val.warn { color: #f0a030; }
  .ltv-val.danger { color: var(--danger); }

  .warning {
    font-size: 0.72rem;
    color: var(--danger);
    letter-spacing: 0.06em;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    margin-top: 0.75rem;
  }
  .caution {
    font-size: 0.72rem;
    color: #f0a030;
    letter-spacing: 0.06em;
    padding: 0.5rem 0.75rem;
    border: 1px solid #f0a030;
    margin-top: 0.75rem;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
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
