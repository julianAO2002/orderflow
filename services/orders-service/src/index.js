const { createApp } = require('./app');
const { createOrderStore } = require('./orderStore');
const { createInventoryClient } = require('./inventoryClient');
const { createRabbitPublisher } = require('./rabbit');
const { createKafkaPublisher } = require('./kafka');
const { createEventPublisher } = require('./events');

const config = {
  port: Number(process.env.PORT ?? 3000),
  inventoryUrl: process.env.INVENTORY_URL ?? 'http://localhost:3001',
  inventoryTimeoutMs: Number(process.env.INVENTORY_TIMEOUT_MS ?? 2000),
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
};

async function withRetry(label, fn, attempts = 20, delayMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`[orders-service] ${label} not ready (${i}/${attempts}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const rabbit = await withRetry('rabbitmq', () => createRabbitPublisher(config.rabbitUrl));
  const kafka = await withRetry('kafka', () => createKafkaPublisher(config.kafkaBrokers));

  const app = createApp({
    store: createOrderStore(),
    inventory: createInventoryClient(config.inventoryUrl, { timeoutMs: config.inventoryTimeoutMs }),
    events: createEventPublisher({ rabbit, kafka }),
  });

  app.listen(config.port, () => console.log(`[orders-service] listening on :${config.port}`));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch((err) => {
  console.error('[orders-service] fatal', err);
  process.exit(1);
});
