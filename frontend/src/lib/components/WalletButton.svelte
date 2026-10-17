<script lang="ts">
  import { address, connected, connect, disconnect } from "$lib/stores/wallet";
</script>

{#if $connected}
  <button class="wallet-btn connected" onclick={disconnect}>
    <span class="dot"></span>
    {$address?.slice(0, 6)}...{$address?.slice(-4)}
  </button>
{:else}
  <button class="wallet-btn" onclick={connect}>
    [ CONNECT WALLET ]
  </button>
{/if}

<style>
  .wallet-btn {
    padding: 0.4rem 0.75rem;
    border: 1px solid #444;
    border-radius: 0;
    background: transparent;
    color: #ccc;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.05em;
    transition: border-color 0.15s, color 0.15s;
  }
  .wallet-btn:hover {
    border-color: #888;
    color: var(--text);
  }
  .wallet-btn.connected {
    color: var(--text);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 4px var(--accent);
  }
</style>
