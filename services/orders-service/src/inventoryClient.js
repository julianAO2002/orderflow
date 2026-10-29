class InventoryUnavailableError extends Error {}

// Synchronous REST client: every call blocks the order flow until
// InventoryService answers or the timeout expires.
function createInventoryClient(baseUrl, { timeoutMs = 2000 } = {}) {
  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new InventoryUnavailableError(`InventoryService unreachable: ${err.message}`);
    }
    if (res.status >= 500) {
      throw new InventoryUnavailableError(`InventoryService answered ${res.status}`);
    }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const productPath = (productId) => `/products/${encodeURIComponent(productId)}`;

  return {
    checkAvailability: (productId, quantity) =>
      request(`${productPath(productId)}/availability?quantity=${quantity}`),

    reserve: (productId, quantity) =>
      request(`${productPath(productId)}/reservations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      }),
  };
}

module.exports = { createInventoryClient, InventoryUnavailableError };
