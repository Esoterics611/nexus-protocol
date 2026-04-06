<script lang="ts">
  import TxButton from "$lib/components/TxButton.svelte";
  import { address, connected, publicClient, walletClient, formatNUSD, parseNUSD } from "$lib/stores/wallet";
  import { connect } from "$lib/stores/wallet";
  import { getMintController, getStablecoin } from "$lib/contracts";
  import { get } from "svelte/store";
  import { onMount } from "svelte";

  let mintTo = $state("");
  let mintAmount = $state("");
  let allocMinter = $state("");
  let allocCeiling = $state("");
  let resetMinter = $state("");
  let burnFrom = $state("");
  let burnAmount = $state("");

  // Current wallet's allocation info
  let myAllocation = $state<bigint | null>(null);
  let myMinted = $state<bigint | null>(null);
  let myRemaining = $state<bigint | null>(null);
  let totalSupply = $state<bigint | null>(null);
  let loading = $state(false);

  async function loadInfo() {
    const acc = get(address);
    if (!acc) return;
    loading = true;
    try {
      const mc = getMintController(publicClient);
      const stablecoin = getStablecoin(publicClient);
      const [alloc, minted, remaining, supply] = await Promise.all([
        mc.read.mintAllocation([acc]),
        mc.read.mintedAmount([acc]),
        mc.read.remainingAllocation([acc]),
        stablecoin.read.totalSupply(),
      ]);
      myAllocation = alloc;
      myMinted = minted;
      myRemaining = remaining;
      totalSupply = supply;
    } catch {
      // node unavailable
    }
    loading = false;
  }

  $effect(() => { if ($address) loadInfo(); });

  function fmtUSD(v: bigint) {
    return "$" + Number(formatNUSD(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  async function handleMint() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!mintTo.startsWith("0x")) throw new Error("Invalid address");
    const mc = getMintController(wc);
    const tx = await mc.write.mint([mintTo as `0x${string}`, parseNUSD(mintAmount)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    mintTo = ""; mintAmount = "";
    await loadInfo();
  }

  async function handleSetAllocation() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!allocMinter.startsWith("0x")) throw new Error("Invalid address");
    const mc = getMintController(wc);
    const tx = await mc.write.setMintAllocation([allocMinter as `0x${string}`, parseNUSD(allocCeiling)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    allocMinter = ""; allocCeiling = "";
    await loadInfo();
  }

  async function handleReset() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!resetMinter.startsWith("0x")) throw new Error("Invalid address");
    const mc = getMintController(wc);
    const tx = await mc.write.resetMintedAmount([resetMinter as `0x${string}`]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    resetMinter = "";
    await loadInfo();
  }

  async function handleBurn() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!burnFrom.startsWith("0x")) throw new Error("Invalid address");
    const stablecoin = getStablecoin(wc);
    const tx = await stablecoin.write.burn([burnFrom as `0x${string}`, parseNUSD(burnAmount)]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    burnFrom = ""; burnAmount = "";
    await loadInfo();
  }
</script>

<a href="/admin" class="back">← DASHBOARD</a>
<div class="page-header">
  <span class="prompt">></span> MINT OPERATIONS <span class="line"></span>
</div>

{#if !$connected}
  <div class="empty-state">
    <button class="connect-link" onclick={connect}>CONNECT WALLET</button> TO ACCESS MINT OPERATIONS
  </div>
{:else}
  <div class="allocation-bar">
    <div class="alloc-item"><span class="alloc-label">NUSD SUPPLY</span><span class="alloc-value">{totalSupply !== null ? fmtUSD(totalSupply) : "—"}</span></div>
    <div class="alloc-item"><span class="alloc-label">MY CEILING</span><span class="alloc-value">{myAllocation !== null ? fmtUSD(myAllocation) : "—"}</span></div>
    <div class="alloc-item"><span class="alloc-label">MY MINTED</span><span class="alloc-value">{myMinted !== null ? fmtUSD(myMinted) : "—"}</span></div>
    <div class="alloc-item"><span class="alloc-label">REMAINING</span><span class="alloc-value accent">{myRemaining !== null ? fmtUSD(myRemaining) : "—"}</span></div>
  </div>

  <div class="grid">
    <section class="card">
      <div class="card-title">MINT NUSD</div>
      <label>RECIPIENT ADDRESS</label>
      <input bind:value={mintTo} placeholder="0x..." />
      <label>AMOUNT (NUSD)</label>
      <input type="number" bind:value={mintAmount} placeholder="0.00" />
      <TxButton label="Mint" loadingLabel="Minting…" onclick={handleMint} disabled={!mintTo || !mintAmount} />
    </section>

    <section class="card">
      <div class="card-title">SET ALLOCATION</div>
      <label>MINTER ADDRESS</label>
      <input bind:value={allocMinter} placeholder="0x..." />
      <label>CEILING (NUSD)</label>
      <input type="number" bind:value={allocCeiling} placeholder="0.00" />
      <TxButton label="Set Allocation" loadingLabel="Setting…" onclick={handleSetAllocation} disabled={!allocMinter || !allocCeiling} />
      <div class="sub-section">
        <label>RESET MINTED AMOUNT FOR</label>
        <input bind:value={resetMinter} placeholder="0x..." />
        <TxButton label="Reset" loadingLabel="Resetting…" onclick={handleReset} disabled={!resetMinter} variant="secondary" />
      </div>
    </section>

    <section class="card">
      <div class="card-title">BURN NUSD</div>
      <label>FROM ADDRESS</label>
      <input bind:value={burnFrom} placeholder="0x..." />
      <label>AMOUNT (NUSD)</label>
      <input type="number" bind:value={burnAmount} placeholder="0.00" />
      <TxButton label="Burn" loadingLabel="Burning…" onclick={handleBurn} disabled={!burnFrom || !burnAmount} variant="danger" />
    </section>
  </div>
{/if}

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
  .line {
    flex: 1;
    height: 1px;
    background: var(--border);
    margin-left: 0.5rem;
  }

  .allocation-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
    padding: 1.25rem 0;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }
  .alloc-item { display: flex; flex-direction: column; }
  .alloc-label {
    font-size: 0.7rem;
    color: var(--muted);
    letter-spacing: 0.1em;
  }
  .alloc-value {
    font-size: 1.1rem;
    font-weight: 500;
    margin-top: 0.2rem;
    font-family: var(--font-mono);
  }
  .accent { color: var(--accent); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }
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

  .sub-section { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); }

  .empty-state {
    color: var(--muted-dim);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-align: center;
    padding: 4rem;
  }
  .connect-link {
    background: none;
    border: none;
    color: var(--text);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-decoration: underline;
    padding: 0;
  }
</style>
