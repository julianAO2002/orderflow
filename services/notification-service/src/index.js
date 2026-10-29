const { createMailer } = require('./mailer');
const { createDedup } = require('./dedup');
const { startRabbitConsumer } = require('./rabbitConsumer');
const { startKafkaConsumer } = require('./kafkaConsumer');

const config = {
  rabbitUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  smtpHost: process.env.SMTP_HOST ?? 'localhost',
  smtpPort: Number(process.env.SMTP_PORT ?? 1025),
  mailFrom: process.env.MAIL_FROM ?? 'OrderFlow <pedidos@orderflow.local>',
};

async function withRetry(label, fn, attempts = 20, delayMs = 3000) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.warn(`[notification-service] ${label} not ready (${i}/${attempts}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const mailer = createMailer({ host: config.smtpHost, port: config.smtpPort, from: config.mailFrom });
  const dedup = createDedup();

  await withRetry('rabbitmq', () => startRabbitConsumer({ url: config.rabbitUrl, mailer, dedup }));
  const kafkaConsumer = await withRetry('kafka', () => startKafkaConsumer({ brokers: config.kafkaBrokers, mailer, dedup }));
  console.log('[notification-service] ready');

  // Unacked RabbitMQ messages are requeued by the broker when the process exits.
  process.on('SIGTERM', async () => {
    await kafkaConsumer.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[notification-service] fatal', err);
  process.exit(1);
});
