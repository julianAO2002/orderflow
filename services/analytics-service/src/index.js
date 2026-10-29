const express = require('express');
const { Kafka, logLevel } = require('kafkajs');
const { createMetrics } = require('./metrics');

const TOPIC = 'orders.status-changed';

const config = {
  port: Number(process.env.PORT ?? 3003),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  replayOnStart: (process.env.REPLAY_ON_START ?? 'true') === 'true',
};

async function withRetry(label, fn, attempts = 20, delayMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`[analytics-service] ${label} not ready (${i}/${attempts}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function startConsumer(metrics) {
  const kafka = new Kafka({ clientId: 'analytics-service', brokers: config.kafkaBrokers, logLevel: logLevel.WARN });
  const consumer = kafka.consumer({ groupId: 'analytics-service' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      const event = JSON.parse(message.value.toString());
      if (metrics.apply(event)) {
        console.log(`[kafka] p${partition} offset ${message.offset}: ${event.orderId} -> ${event.status}`);
      }
    },
  });

  // Metrics live in memory, so on startup they are rebuilt by re-reading the
  // whole topic from offset 0 (Kafka retains the events after consumption).
  if (config.replayOnStart) {
    const admin = kafka.admin();
    await admin.connect();
    const [{ partitions }] = (await admin.fetchTopicMetadata({ topics: [TOPIC] })).topics;
    await admin.disconnect();
    for (const { partitionId } of partitions) {
      consumer.seek({ topic: TOPIC, partition: partitionId, offset: '0' });
    }
    console.log(`[analytics-service] replaying ${TOPIC} from the beginning`);
  }
  return consumer;
}

async function main() {
  const metrics = createMetrics();

  const app = express();
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/metrics', (req, res) => res.json(metrics.snapshot()));
  app.listen(config.port, () => console.log(`[analytics-service] listening on :${config.port}`));

  const consumer = await withRetry('kafka', () => startConsumer(metrics));

  // Leaving the group explicitly lets a restarted instance rejoin right away.
  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[analytics-service] fatal', err);
  process.exit(1);
});
