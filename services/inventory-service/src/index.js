const { createApp } = require('./app');
const { createStock } = require('./stock');

const port = Number(process.env.PORT ?? 3001);
const delayMs = Number(process.env.INVENTORY_DELAY_MS ?? 0);

createApp(createStock(), { delayMs }).listen(port, () => {
  console.log(`[inventory-service] listening on :${port} (delay ${delayMs}ms)`);
});

process.on('SIGTERM', () => process.exit(0));
