const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createStock } = require('../src/stock');

let server;
let baseUrl;

before(async () => {
  const stock = createStock([{ productId: 'A', name: 'Producto A', stock: 3 }]);
  server = createApp(stock).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test('reports availability for a product with enough stock', async () => {
  const res = await fetch(`${baseUrl}/products/A/availability?quantity=2`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    productId: 'A', name: 'Producto A', requested: 2, stock: 3, available: true,
  });
});

test('reports unavailable when requested quantity exceeds stock', async () => {
  const res = await fetch(`${baseUrl}/products/A/availability?quantity=10`);
  assert.equal((await res.json()).available, false);
});

test('returns 404 for an unknown product', async () => {
  const res = await fetch(`${baseUrl}/products/NOPE/availability?quantity=1`);
  assert.equal(res.status, 404);
});

test('rejects a non positive quantity', async () => {
  const res = await fetch(`${baseUrl}/products/A/availability?quantity=0`);
  assert.equal(res.status, 400);
});

test('reservation decrements stock and refuses to oversell', async () => {
  const reserve = (quantity) => fetch(`${baseUrl}/products/A/reservations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });

  const ok = await reserve(3);
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).remainingStock, 0);

  const refused = await reserve(1);
  assert.equal(refused.status, 409);
});
