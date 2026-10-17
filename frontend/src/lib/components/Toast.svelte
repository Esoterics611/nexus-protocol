<script lang="ts">
  import { toasts } from "$lib/stores/toast";
</script>

<div class="toast-container">
  {#each $toasts as toast (toast.id)}
    <div class="toast {toast.type}">
      {toast.message}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 1000;
    pointer-events: none;
  }
  .toast {
    padding: 0.75rem 1.25rem;
    border-radius: 0;
    border-left: 3px solid var(--muted);
    background: #0a0a0a;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--text);
    max-width: 360px;
    word-break: break-word;
  }
  .toast.success { border-left-color: var(--accent); }
  .toast.error   { border-left-color: var(--danger); }
  .toast.info    { border-left-color: #666; }
</style>
