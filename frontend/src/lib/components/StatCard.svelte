<script lang="ts">
  let { label, value, sub = "" }: { label: string; value: string; sub?: string } = $props();
</script>

<div class="stat-card">
  <div class="label">{label}</div>
  <div class="value">{value}</div>
  {#if sub}<div class="sub" class:positive={sub.includes("+") || sub.includes("Active") || sub.includes("Running")} class:negative={sub.includes("-") || sub.includes("Paused")}>{sub}</div>{/if}
</div>

<style>
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 1px;
    padding: 1.25rem 1.5rem;
    min-width: 180px;
  }
  .label {
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .value {
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 1.5rem;
    font-weight: 500;
    margin-top: 0.35rem;
  }
  .sub {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    margin-top: 0.3rem;
    color: var(--muted);
  }
  .sub.positive { color: var(--accent); }
  .sub.negative { color: var(--danger); }
</style>
