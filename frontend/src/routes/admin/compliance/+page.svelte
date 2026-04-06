<script lang="ts">
  import TxButton from "$lib/components/TxButton.svelte";
  import { addToast } from "$lib/stores/toast";
  import { walletClient, publicClient } from "$lib/stores/wallet";
  import { getRestrictionList, getKYCRegistry, getAccreditedInvestor } from "$lib/contracts";
  import { get } from "svelte/store";

  let activeTab: "denylist" | "kyc" | "accreditation" = $state("denylist");

  // Denylist
  let checkAddr = $state("");
  let checkResult = $state<string | null>(null);
  let restrictAddr = $state("");
  let batchText = $state("");

  // KYC
  let kycAddr = $state("");
  let kycExpiry = $state("");
  let kycStatus = $state<{ verified: boolean; expiry: bigint; verifiedAt: bigint } | null>(null);

  // Accreditation
  let accAddr = $state("");
  let accStatus = $state<boolean | null>(null);

  async function checkRestricted() {
    if (!checkAddr.startsWith("0x")) { addToast("Invalid address", "error"); return; }
    try {
      const rl = getRestrictionList(publicClient);
      const r = await rl.read.isRestricted([checkAddr as `0x${string}`]);
      checkResult = r ? "RESTRICTED" : "Not restricted";
    } catch (e) { addToast(String(e), "error"); }
  }

  async function handleRestrict() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!restrictAddr.startsWith("0x")) throw new Error("Invalid address");
    const rl = getRestrictionList(wc);
    const tx = await rl.write.restrict([restrictAddr as `0x${string}`]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    restrictAddr = "";
  }

  async function handleUnrestrict() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!restrictAddr.startsWith("0x")) throw new Error("Invalid address");
    const rl = getRestrictionList(wc);
    const tx = await rl.write.unrestrict([restrictAddr as `0x${string}`]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    restrictAddr = "";
  }

  async function handleBatchRestrict() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    const addrs = batchText.split("\n").map(s => s.trim()).filter(s => s.startsWith("0x")) as `0x${string}`[];
    if (!addrs.length) throw new Error("No valid addresses");
    const rl = getRestrictionList(wc);
    const tx = await rl.write.batchRestrict([addrs]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    batchText = "";
  }

  async function checkKYC() {
    if (!kycAddr.startsWith("0x")) { addToast("Invalid address", "error"); return; }
    try {
      const kyc = getKYCRegistry(publicClient);
      kycStatus = await kyc.read.getStatus([kycAddr as `0x${string}`]);
    } catch (e) { addToast(String(e), "error"); }
  }

  async function handleVerify() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!kycAddr.startsWith("0x")) throw new Error("Invalid address");
    if (!kycExpiry) throw new Error("Set expiry date");
    const expiry = BigInt(Math.floor(new Date(kycExpiry).getTime() / 1000));
    const kyc = getKYCRegistry(wc);
    const tx = await kyc.write.setVerified([kycAddr as `0x${string}`, expiry]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await checkKYC();
  }

  async function handleRevoke() {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!kycAddr.startsWith("0x")) throw new Error("Invalid address");
    const kyc = getKYCRegistry(wc);
    const tx = await kyc.write.revokeVerification([kycAddr as `0x${string}`]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    kycStatus = null;
  }

  async function checkAccreditation() {
    if (!accAddr.startsWith("0x")) { addToast("Invalid address", "error"); return; }
    try {
      const ai = getAccreditedInvestor(publicClient);
      accStatus = await ai.read.isAccredited([accAddr as `0x${string}`]);
    } catch (e) { addToast(String(e), "error"); }
  }

  async function handleSetAccredited(status: boolean) {
    const wc = get(walletClient);
    if (!wc) throw new Error("Wallet not connected");
    if (!accAddr.startsWith("0x")) throw new Error("Invalid address");
    const ai = getAccreditedInvestor(wc);
    const tx = await ai.write.setAccredited([accAddr as `0x${string}`, status]);
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await checkAccreditation();
  }

  function fmtDate(ts: bigint) {
    if (ts === 0n) return "—";
    return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
  }
</script>

<a href="/admin" class="back">← DASHBOARD</a>
<div class="page-header">
  <span class="prompt">></span> COMPLIANCE MANAGEMENT <span class="line"></span>
</div>

<div class="tabs">
  <button class:active={activeTab === "denylist"} onclick={() => (activeTab = "denylist")}>[ DENYLIST ]</button>
  <button class:active={activeTab === "kyc"} onclick={() => (activeTab = "kyc")}>[ KYC ]</button>
  <button class:active={activeTab === "accreditation"} onclick={() => (activeTab = "accreditation")}>[ ACCREDITATION ]</button>
</div>

{#if activeTab === "denylist"}
  <section class="card">
    <div class="card-title">RESTRICTION LIST</div>

    <div class="row">
      <input bind:value={checkAddr} placeholder="Check address..." />
      <button class="btn" onclick={checkRestricted}>CHECK</button>
    </div>
    {#if checkResult !== null}
      <p class="status" class:red={checkResult === "RESTRICTED"} class:green={checkResult !== "RESTRICTED"}>
        {checkResult}
      </p>
    {/if}

    <div class="row" style="margin-top: 1rem;">
      <input bind:value={restrictAddr} placeholder="Address to restrict/unrestrict..." />
      <TxButton label="Restrict" loadingLabel="…" onclick={handleRestrict} disabled={!restrictAddr} variant="danger" />
      <TxButton label="Unrestrict" loadingLabel="…" onclick={handleUnrestrict} disabled={!restrictAddr} variant="secondary" />
    </div>

    <div class="sub-section">
      <label>BATCH RESTRICT (ONE ADDRESS PER LINE)</label>
      <textarea bind:value={batchText} rows="4" placeholder="0x...&#10;0x..."></textarea>
      <TxButton label="Batch Restrict" loadingLabel="Submitting…" onclick={handleBatchRestrict} disabled={!batchText.trim()} variant="danger" />
    </div>
  </section>

{:else if activeTab === "kyc"}
  <section class="card">
    <div class="card-title">KYC REGISTRY</div>
    <div class="form-grid">
      <div>
        <label>ADDRESS</label>
        <input bind:value={kycAddr} placeholder="0x..." />
      </div>
      <div>
        <label>EXPIRY DATE</label>
        <input type="date" bind:value={kycExpiry} />
      </div>
    </div>
    <div class="btn-row">
      <button class="btn" onclick={checkKYC} disabled={!kycAddr}>CHECK STATUS</button>
      <TxButton label="Verify" loadingLabel="Verifying…" onclick={handleVerify} disabled={!kycAddr || !kycExpiry} />
      <TxButton label="Revoke" loadingLabel="Revoking…" onclick={handleRevoke} disabled={!kycAddr} variant="danger" />
    </div>
    {#if kycStatus !== null}
      <div class="status-box">
        <span class:green={kycStatus.verified} class:red={!kycStatus.verified}>
          {kycStatus.verified ? "VERIFIED" : "NOT VERIFIED"}
        </span>
        {#if kycStatus.verified}
          · Expires {fmtDate(kycStatus.expiry)}
          · Verified {fmtDate(kycStatus.verifiedAt)}
        {/if}
      </div>
    {/if}
  </section>

{:else}
  <section class="card">
    <div class="card-title">ACCREDITED INVESTOR REGISTRY</div>
    <div class="row">
      <input bind:value={accAddr} placeholder="Address..." />
      <button class="btn" onclick={checkAccreditation} disabled={!accAddr}>CHECK</button>
    </div>
    {#if accStatus !== null}
      <p class="status" class:green={accStatus} class:red={!accStatus}>
        {accStatus ? "ACCREDITED" : "NOT ACCREDITED"}
      </p>
    {/if}
    <div class="btn-row" style="margin-top: 1rem;">
      <TxButton label="Set Accredited" loadingLabel="…" onclick={() => handleSetAccredited(true)} disabled={!accAddr} />
      <TxButton label="Revoke" loadingLabel="…" onclick={() => handleSetAccredited(false)} disabled={!accAddr} variant="danger" />
    </div>
  </section>
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
  .line { flex: 1; height: 1px; background: var(--border); margin-left: 0.5rem; }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .tabs button {
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: #777;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    border-bottom: 2px solid transparent;
    transition: color 0.15s;
  }
  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .tabs button:hover:not(.active) { color: #888; }

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
    margin-bottom: 0.25rem;
  }

  .row { display: flex; gap: 0.5rem; align-items: flex-end; }
  .form-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1rem; }
  .btn-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }

  input, textarea {
    flex: 1;
    padding: 0.6rem;
    border: 1px solid #222;
    border-radius: 0;
    background: #000;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    box-sizing: border-box;
    width: 100%;
  }
  input:focus, textarea:focus { outline: none; border-color: #444; }
  input::placeholder, textarea::placeholder { color: var(--muted-dim); }
  textarea { resize: vertical; }

  .btn {
    padding: 0.6rem 1rem;
    border: 1px solid #333;
    border-radius: 0;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    background: #111;
    color: #aaa;
    white-space: nowrap;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn:hover { border-color: #666; color: #fff; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .status { font-size: 0.85rem; margin: 0.5rem 0 0; font-family: var(--font-mono); letter-spacing: 0.05em; }
  .status-box { margin-top: 0.75rem; font-size: 0.8rem; color: var(--muted); font-family: var(--font-mono); }
  .green { color: var(--accent); }
  .red { color: var(--danger); }

  .sub-section { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); }
</style>
