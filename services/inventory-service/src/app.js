const express = require('express');
const { InsufficientStockError, ProductNotFoundError } = require('./stock');

function parseQuantity(raw) {
  const quantity = Number(raw);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function createApp(stock, { delayMs = 0 } = {}) {
  const app = express();
  app.use(express.json());

  // Optional artificial latency to observe how a slow dependency affects
  // the synchronous caller.
  if (delayMs > 0) {
    app.use((req, res, next) => setTimeout(next, delayMs));
  }

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/products', (req, res) => res.json(stock.list()));

  app.get('/products/:productId/availability', (req, res) => {
    const quantity = parseQuantity(req.query.quantity ?? 1);
    if (!quantity) return res.status(400).json({ error: 'quantity must be a positive integer' });
    res.json(stock.availability(req.params.productId, quantity));
  });

  app.post('/products/:productId/reservations', (req, res) => {
    const quantity = parseQuantity(req.body?.quantity);
    if (!quantity) return res.status(400).json({ error: 'quantity must be a positive integer' });
    res.status(201).json(stock.reserve(req.params.productId, quantity));
  });

  app.use((err, req, res, next) => {
    if (err instanceof ProductNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof InsufficientStockError) return res.status(409).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

module.exports = { createApp };
