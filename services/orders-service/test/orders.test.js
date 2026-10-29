const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createOrderStore } = require('../src/orderStore');
const { InventoryUnavailableError } = require('../src/inventoryClient');

let server;
let baseUrl;
let published;
let inventory;

function fakeInventory({ stock = 5, down = false } = {}) {
  return {
    calls: [],
    async checkAvailability(productId, quantity) {
      this.calls.push(['check', productId, quantity]);
      if (down) throw new InventoryUnavailableError('InventoryService unreachable');
      return { status: 200, body: { productId, stock, available: stock >= quantity } };
    },
    async reserve(productId, quantity) {
      this.calls.push(['reserve', productId, quantity]);
      return { status: 201, body: { remainingStock: stock - quantity } };
    },
  };
}

async function start(inventoryOptions) {
  inventory = fakeInventory(inventoryOptions);
  published = [];
  const events = {
    orderCreated: async (order) => published.push(['created', order.status]),
    statusChanged: async (order, previous) => published.push(['changed', previous, order.status]),
  };
  server = createApp({ store: createOrderStore(), inventory, events }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
}

const post = (path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});

const newOrder = { productId: 'P-001', quantity: 2, customerEmail: 'cliente@mail.com' };

beforeEach(() => start());
afterEach(() => server.close());

test('creating an order stores it as CREATED and publishes OrderCreated', async () => {
  const res = await post('/orders', newOrder);
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.status, 'CREATED');
  assert.deepEqual(published, [['created', 'CREATED']]);

  const fetched = await fetch(`${baseUrl}/orders/${order.id}`);
  assert.equal((await fetched.json()).id, order.id);
});

test('rejects an order with invalid data and publishes nothing', async () => {
  const res = await post('/orders', { ...newOrder, quantity: -1 });
  assert.equal(res.status, 400);
  assert.deepEqual(published, []);
});

test('confirm queries InventoryService, reserves stock and publishes CONFIRMED', async () => {
  const { id } = await (await post('/orders', newOrder)).json();
  const res = await post(`/orders/${id}/confirm`);

  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'CONFIRMED');
  assert.deepEqual(inventory.calls, [['check', 'P-001', 2], ['reserve', 'P-001', 2]]);
  assert.deepEqual(published.at(-1), ['changed', 'CREATED', 'CONFIRMED']);
});

test('confirm answers 409 and keeps the order CREATED when stock is insufficient', async () => {
  server.close();
  await start({ stock: 1 });
  const { id } = await (await post('/orders', newOrder)).json();

  const res = await post(`/orders/${id}/confirm`);
  assert.equal(res.status, 409);
  assert.equal((await (await fetch(`${baseUrl}/orders/${id}`)).json()).status, 'CREATED');
  assert.equal(inventory.calls.some(([op]) => op === 'reserve'), false);
});

test('confirm answers 503 when InventoryService is down', async () => {
  server.close();
  await start({ down: true });
  const { id } = await (await post('/orders', newOrder)).json();

  const res = await post(`/orders/${id}/confirm`);
  assert.equal(res.status, 503);
  assert.equal((await (await fetch(`${baseUrl}/orders/${id}`)).json()).status, 'CREATED');
});

test('ship requires a confirmed order and then publishes SHIPPED', async () => {
  const { id } = await (await post('/orders', newOrder)).json();

  assert.equal((await post(`/orders/${id}/ship`)).status, 409);

  await post(`/orders/${id}/confirm`);
  const res = await post(`/orders/${id}/ship`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'SHIPPED');
  assert.deepEqual(published.at(-1), ['changed', 'CONFIRMED', 'SHIPPED']);
});

test('unknown order answers 404', async () => {
  assert.equal((await post('/orders/nope/confirm')).status, 404);
});
