/**
 * Generates the window.ethereum injection script string.
 *
 * The injected code runs in browser context (no imports possible).
 * It delegates ALL requests to window.__nexusWalletRequest, which is
 * exposed by Playwright and runs in Node.js with full viem access.
 *
 * Flow:
 *   browser: window.ethereum.request({ method, params })
 *     → window.__nexusWalletRequest(method, params)   [Playwright bridge]
 *       → Node.js: sign / submit / forward to RPC
 *     ← returns result
 *   browser: gets the result back
 */

/**
 * Returns the script string to inject via page.addInitScript().
 * @param walletAddress - The test wallet's address (0x...)
 */
export function getInjectionScript(walletAddress: string): string {
  return `
(function() {
  const WALLET_ADDRESS = '${walletAddress}';

  // Minimal event emitter for accountsChanged / chainChanged
  const _listeners = {};
  function emit(event, ...args) {
    (_listeners[event] || []).forEach(fn => fn(...args));
  }

  window.ethereum = {
    isMetaMask: true,
    isCoinbaseWallet: false,
    selectedAddress: WALLET_ADDRESS,
    chainId: '0x14a34',
    networkVersion: '84532',

    // Core EIP-1193 method
    request: async function({ method, params }) {
      // Fast-path: pure client-side responses that need no Node.js round-trip
      if (method === 'eth_chainId')   return '0x14a34';
      if (method === 'net_version')   return '84532';
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return [WALLET_ADDRESS];
      }
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        return null;
      }

      // Everything else goes through the Node.js bridge
      // __nexusWalletRequest is exposed by page.exposeFunction in the fixture
      return window.__nexusWalletRequest(method, params || []);
    },

    // Event listener API (wallet.ts uses these for accountsChanged / chainChanged)
    on: function(event, handler) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(handler);
      return this;
    },
    removeListener: function(event, handler) {
      if (_listeners[event]) {
        _listeners[event] = _listeners[event].filter(fn => fn !== handler);
      }
      return this;
    },
    once: function(event, handler) {
      const wrapper = (...args) => { handler(...args); this.removeListener(event, wrapper); };
      return this.on(event, wrapper);
    },

    // Legacy compat
    enable: function() { return this.request({ method: 'eth_requestAccounts', params: [] }); },
    send: function(method, params) { return this.request({ method, params }); },
    sendAsync: function({ method, params }, cb) {
      this.request({ method, params })
        .then(result => cb(null, { id: 1, jsonrpc: '2.0', result }))
        .catch(err => cb(err));
    },
  };

  // Signal to dApps that ethereum is available
  window.dispatchEvent(new Event('ethereum#initialized'));
})();
`;
}
