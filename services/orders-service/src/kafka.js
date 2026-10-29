const { randomUUID } = require('node:crypto');
const { Kafka, Partitioners, logLevel } = require('kafkajs');

const TOPIC = 'orders.status-changed';

async function createKafkaPublisher(brokers) {
  const kafka = new Kafka({ clientId: 'orders-service', brokers, logLevel: logLevel.WARN });
  const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await producer.connect();

  return {
    async publishStatusChanged(order, previousStatus) {
      const event = {
        eventId: randomUUID(),
        type: 'OrderStatusChanged',
        orderId: order.id,
        previousStatus,
        status: order.status,
        productId: order.productId,
        quantity: order.quantity,
        customerEmail: order.customerEmail,
        occurredAt: new Date().toISOString(),
      };
      // Keying by orderId sends every event of an order to the same
      // partition, which keeps them in order.
      await producer.send({
        topic: TOPIC,
        messages: [{ key: order.id, value: JSON.stringify(event) }],
      });
    },
  };
}

module.exports = { createKafkaPublisher };
