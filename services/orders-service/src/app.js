const express = require('express');
const { STATUS, OrderNotFoundError, InvalidTransitionError } = require('./orderStore');
const { InventoryUnavailableError } = require('./inventoryClient');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateNewOrder(body = {}) {
  const { productId, quantity, customerEmail } = body;
  if (typeof productId !== 'string' || !productId.trim()) return 'productId is required';
  if (!Number.isInteger(quantity) || quantity <= 0) return 'quantity must be a positive integer';
  if (typeof customerEmail !== 'string' || !EMAIL_PATTERN.test(customerEmail)) return 'customerEmail is invalid';
  return null;
}

function createApp({ store, inventory, events }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/orders', (req, res) => res.json(store.list()));

  app.get('/orders/:id', (req, res) => res.json(store.get(req.params.id)));

  app.post('/orders', async (req, res) => {
    const error = validateNewOrder(req.body);
    if (error) return res.status(400).json({ error });

    const order = store.create(req.body);
    await events.orderCreated(order);
    res.status(201).json(order);
  });

  app.post('/orders/:id/confirm', async (req, res) => {
    const order = store.assertCanTransition(req.params.id, STATUS.CONFIRMED);

    const availability = await inventory.checkAvailability(order.productId, order.quantity);
    if (availability.status === 404) {
      return res.status(422).json({ error: `Product ${order.productId} does not exist` });
    }
    if (!availability.body.available) {
      return res.status(409).json({
        error: 'Insufficient stock',
        requested: order.quantity,
        stock: availability.body.stock,
      });
    }

    // The stock may have changed between the query and the reservation;
    // the reservation is the authoritative check.
    const reservation = await inventory.reserve(order.productId, order.quantity);
    if (reservation.status !== 201) {
      return res.status(409).json({ error: reservation.body.error ?? 'Reservation failed' });
    }

    const { previousStatus } = store.transition(order.id, STATUS.CONFIRMED);
    await events.statusChanged(order, previousStatus);
    res.json(order);
  });

  app.post('/orders/:id/ship', async (req, res) => {
    const { order, previousStatus } = store.transition(req.params.id, STATUS.SHIPPED);
    await events.statusChanged(order, previousStatus);
    res.json(order);
  });

  app.use((err, req, res, next) => {
    if (err instanceof OrderNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof InvalidTransitionError) return res.status(409).json({ error: err.message });
    if (err instanceof InventoryUnavailableError) return res.status(503).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

module.exports = { createApp };
