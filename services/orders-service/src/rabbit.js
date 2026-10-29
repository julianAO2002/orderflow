const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');

const EXCHANGE = 'orders';
const ROUTING_KEY = 'order.created';
const QUEUE = 'notifications.order-created';
const DEAD_LETTER_EXCHANGE = 'orders.dlx';
const DEAD_LETTER_QUEUE = 'notifications.order-created.dlq';

// Both producer and consumer declare the same topology, so the durable queue
// exists (and retains messages) even if NotificationService never started.
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

async function createRabbitPublisher(url) {
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  await declareTopology(channel);

  connection.on('error', (err) => console.error(`[rabbitmq] connection error: ${err.message}`));
  connection.on('close', () => console.error('[rabbitmq] connection closed'));

  return {
    publishOrderCreated(order) {
      const message = {
        messageId: randomUUID(),
        type: 'OrderCreated',
        orderId: order.id,
        productId: order.productId,
        quantity: order.quantity,
        customerEmail: order.customerEmail,
        createdAt: order.createdAt,
      };
      // Resolves only once the broker confirms it persisted the message.
      return new Promise((resolve, reject) => {
        channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(message)), {
          persistent: true,
          contentType: 'application/json',
          messageId: message.messageId,
        }, (err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

module.exports = { createRabbitPublisher };
