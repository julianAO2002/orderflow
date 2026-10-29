const amqp = require('amqplib');
const { buildEmail } = require('./emails');

const EXCHANGE = 'orders';
const ROUTING_KEY = 'order.created';
const QUEUE = 'notifications.order-created';
const DEAD_LETTER_EXCHANGE = 'orders.dlx';
const DEAD_LETTER_QUEUE = 'notifications.order-created.dlq';

// Same declaration as OrdersService (declaring is idempotent).
async function declareTopology(channel) {
  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
  await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });
  await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '');
  await channel.assertQueue(QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE },
  });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
}

async function startRabbitConsumer({ url, mailer, dedup }) {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await declareTopology(channel);
  await channel.prefetch(1);

  // Let Docker restart the container instead of running half-connected.
  connection.on('close', () => {
    console.error('[rabbitmq] connection closed, exiting');
    process.exit(1);
  });

  await channel.consume(QUEUE, async (msg) => {
    const messageId = msg.properties.messageId;
    try {
      const event = JSON.parse(msg.content.toString());
      if (dedup.seen(`rabbit:${messageId}`)) {
        console.log(`[rabbitmq] duplicate ${messageId} ignored`);
      } else {
        await mailer.send(buildEmail('CREATED', event));
        dedup.remember(`rabbit:${messageId}`);
      }
      // Ack only after the email was sent: if the process dies before this
      // line, RabbitMQ redelivers the message.
      channel.ack(msg);
    } catch (err) {
      // First failure: retry once. Second failure: dead-letter queue.
      const requeue = !msg.fields.redelivered;
      console.error(`[rabbitmq] ${messageId} failed (${err.message}), requeue=${requeue}`);
      channel.nack(msg, false, requeue);
    }
  }, { noAck: false });

  console.log(`[rabbitmq] consuming ${QUEUE}`);
}

module.exports = { startRabbitConsumer };
