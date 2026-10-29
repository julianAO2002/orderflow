const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMetrics } = require('../src/metrics');

const event = (eventId, orderId, status, occurredAt, extra = {}) => ({
  eventId, orderId, status, occurredAt, productId: 'P-001', quantity: 2, ...extra,
});

test('tracks the current status of each order and confirmed units', () => {
  const metrics = createMetrics();
  metrics.apply(event('e1', 'o1', 'CREATED', '2026-01-01T00:00:00.000Z'));
  metrics.apply(event('e2', 'o2', 'CREATED', '2026-01-01T00:00:00.000Z'));
  metrics.apply(event('e3', 'o1', 'CONFIRMED', '2026-01-01T00:00:04.000Z'));
  metrics.apply(event('e4', 'o1', 'SHIPPED', '2026-01-01T00:01:00.000Z'));

  const snap = metrics.snapshot();
  assert.equal(snap.totalEvents, 4);
  assert.equal(snap.totalOrders, 2);
  assert.deepEqual(snap.ordersByStatus, { CREATED: 1, CONFIRMED: 0, SHIPPED: 1 });
  assert.deepEqual(snap.unitsConfirmedByProduct, { 'P-001': 2 });
  assert.equal(snap.avgSecondsToConfirm, 4);
});

test('ignores a redelivered event with the same eventId', () => {
  const metrics = createMetrics();
  const e = event('e1', 'o1', 'CREATED', '2026-01-01T00:00:00.000Z');
  assert.equal(metrics.apply(e), true);
  assert.equal(metrics.apply(e), false);
  assert.equal(metrics.snapshot().totalEvents, 1);
});
