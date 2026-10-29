const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEmail } = require('../src/emails');
const { createDedup } = require('../src/dedup');

const event = { orderId: 'o-1', productId: 'P-001', quantity: 2, customerEmail: 'cliente@mail.com' };

test('builds an email addressed to the customer for each order status', () => {
  for (const status of ['CREATED', 'CONFIRMED', 'SHIPPED']) {
    const email = buildEmail(status, event);
    assert.equal(email.to, 'cliente@mail.com');
    assert.match(email.subject, /o-1/);
  }
});

test('returns no email for an unknown status', () => {
  assert.equal(buildEmail('CANCELLED', event), null);
});

test('dedup recognizes an already processed id and evicts the oldest past the limit', () => {
  const dedup = createDedup(2);
  dedup.remember('a');
  dedup.remember('b');
  assert.equal(dedup.seen('a'), true);
  dedup.remember('c');
  assert.equal(dedup.seen('a'), false);
  assert.equal(dedup.seen('c'), true);
});
