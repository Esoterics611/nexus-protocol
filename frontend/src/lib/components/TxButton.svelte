<script lang="ts">
  import { addToast } from "$lib/stores/toast";

  let {
    label,
    loadingLabel = "Pending...",
    onclick,
    disabled = false,
    variant = "primary",
  }: {
    label: string;
    loadingLabel?: string;
    onclick: () => Promise<void>;
    disabled?: boolean;
    variant?: "primary" | "danger" | "secondary";
  } = $props();

  let pending = $state(false);
  let success = $state(false);

  function parseRevertMsg(msg: string): string {
    if (msg.includes("User rejected") || msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
      return "Transaction rejected by user";
    }
    // Extract custom error name: "reverted with custom error 'FooBar(...)'"
    const customErr = msg.match(/custom error '([A-Za-z]+)\(/);
    if (customErr) return `Contract error: ${customErr[1]}`;
    // Extract revert reason string: 'reverted with reason string "..."'
    const reason = msg.match(/reason string "([^"]+)"/);
    if (reason) return reason[1];
    // Extract short message before newline or Details:
    const short = msg.split(/\n|Details:/)[0].trim();
    return short.length > 0 && short.length <= 140 ? short : msg.slice(0, 140) + "…";
  }

  async function handleClick() {
    if (pending || disabled) return;
    pending = true;
    try {
      await onclick();
      addToast("Transaction confirmed", "success");
      success = true;
      setTimeout(() => { success = false; }, 200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(parseRevertMsg(msg), "error", 8000);
    } finally {
      pending = false;
    }
  }
</script>

<button
  class="txbtn {variant}"
  class:success
  disabled={disabled || pending}
  onclick={handleClick}
>
  {#if pending}
    <span class="cursor">▋</span><span class="confirming">CONFIRMING<span class="dots"></span></span>
  {:else}
    {label.toUpperCase()}
  {/if}
</button>

<style>
  .txbtn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.25rem;
    border: 1px solid #333;
    border-radius: 0;
    background: #111;
    color: #aaa;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .txbtn:not(:disabled):hover {
    border-color: #666;
    color: #fff;
    background: #1a1a1a;
  }

  .txbtn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .txbtn.primary {
    border-color: #444;
    color: #ccc;
  }
  .txbtn.primary:not(:disabled):hover {
    color: #fff;
  }

  .txbtn.danger {
    border-color: var(--danger);
    color: var(--danger);
  }
  .txbtn.danger:not(:disabled):hover {
    background: #1a0000;
    color: var(--danger);
    border-color: var(--danger);
  }

  .txbtn.secondary {
    border-color: #333;
    color: #888;
  }
  .txbtn.secondary:not(:disabled):hover {
    border-color: #666;
    color: #fff;
  }

  .txbtn.success {
    border-color: var(--accent);
    transition: border-color 0.05s;
  }

  .cursor {
    animation: blink-cursor 1s step-end infinite;
    color: var(--accent);
  }

  .confirming {
    color: #888;
  }

  .dots::after {
    content: "";
    animation: ellipsis 1.5s steps(3) infinite;
  }

  @keyframes blink-cursor {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes ellipsis {
    0%   { content: ""; }
    33%  { content: "."; }
    66%  { content: ".."; }
    100% { content: "..."; }
  }
</style>
