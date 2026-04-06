<script lang="ts">
  import WalletButton from "$lib/components/WalletButton.svelte";
  import Toast from "$lib/components/Toast.svelte";
  let { children } = $props();
</script>

<svelte:head>
  <title>Nexus Protocol</title>
</svelte:head>

<div class="app">
  <nav>
    <div class="nav-left">
      <a href="/" class="logo">NEXUS PROTOCOL</a>
      <div class="nav-links">
        <a href="/vaults">VAULTS</a>
        <a href="/derivatives">DERIVATIVES</a>
        <a href="/swap">SWAP</a>
        <a href="/portfolio">PORTFOLIO</a>
        <a href="/admin">ADMIN</a>
      </div>
    </div>
    <WalletButton />
  </nav>

  <main>
    {@render children()}
  </main>
</div>
<Toast />

<style>
  :global(:root) {
    --bg: #080808;
    --surface: #0f0f0f;
    --surface-alt: #0d0d0d;
    --border: #222;
    --border-subtle: #161616;
    --text: #e8e8e8;
    --muted: #999;
    --muted-dim: #666;
    --accent: #00ff41;
    --danger: #ff3333;
    --warn: #ffaa00;
    --font-mono: "IBM Plex Mono", monospace;
  }

  :global(*) { box-sizing: border-box; }

  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.875rem;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  :global(a) { color: #aaa; text-decoration: none; }
  :global(a:hover) { color: var(--text); }

  :global(::selection) {
    background: var(--accent);
    color: var(--bg);
  }

  .app { min-height: 100vh; }

  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 48px;
    padding: 0 3rem;
    border-bottom: 1px solid #1a1a1a;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 3rem;
  }

  .logo {
    color: var(--text) !important;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 0.15em;
    font-family: var(--font-mono);
  }

  .nav-links {
    display: flex;
    gap: 2rem;
  }

  .nav-links a {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    color: var(--muted);
    transition: color 0.15s;
  }

  .nav-links a:hover {
    color: var(--text);
  }

  main {
    max-width: 1440px;
    margin: 0 auto;
    padding: 2rem 3rem;
  }
</style>
