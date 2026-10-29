const INITIAL_PRODUCTS = [
  { productId: 'P-001', name: 'Notebook 14"', stock: 10 },
  { productId: 'P-002', name: 'Mouse inalámbrico', stock: 50 },
  { productId: 'P-003', name: 'Monitor 27"', stock: 0 },
];

class InsufficientStockError extends Error {}
class ProductNotFoundError extends Error {}

function createStock(products = INITIAL_PRODUCTS) {
  const byId = new Map(products.map((p) => [p.productId, { ...p }]));

  function find(productId) {
    const product = byId.get(productId);
    if (!product) throw new ProductNotFoundError(`Product ${productId} not found`);
    return product;
  }

  return {
    list: () => [...byId.values()].map((p) => ({ ...p })),

    availability(productId, quantity) {
      const product = find(productId);
      return {
        productId,
        name: product.name,
        requested: quantity,
        stock: product.stock,
        available: product.stock >= quantity,
      };
    },

    // Check and decrement happen in the same synchronous call, so two
    // concurrent reservations can never oversell the product.
    reserve(productId, quantity) {
      const product = find(productId);
      if (product.stock < quantity) {
        throw new InsufficientStockError(
          `Insufficient stock for ${productId}: requested ${quantity}, available ${product.stock}`,
        );
      }
      product.stock -= quantity;
      return { productId, reserved: quantity, remainingStock: product.stock };
    },
  };
}

module.exports = { createStock, InsufficientStockError, ProductNotFoundError };
