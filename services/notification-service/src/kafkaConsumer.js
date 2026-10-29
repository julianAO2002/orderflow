const { Kafka, logLevel } = require('kafkajs');
const { buildEmail } = require('./emails');

const TOPIC = 'orders.status-changed';

async function startKafkaConsumer({ brokers, mailer, dedup }) {
  const kafka = new Kafka({ clientId: 'notification-service', brokers, logLevel: logLevel.WARN });
  const consumer = kafka.consumer({ groupId: 'notification-service' });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    // The offset is committed only after this handler resolves, so a crash
    // mid-send means the event is read again.
    eachMessage: async ({ partition, message }) => {
      const event = JSON.parse(message.value.toString());
      console.log(`[kafka] p${partition} offset ${message.offset}: ${event.orderId} -> ${event.status}`);

      // The "order created" email already goes through RabbitMQ.
      if (event.status === 'CREATED') return;
      if (dedup.seen(`kafka:${event.eventId}`)) return;

      const email = buildEmail(event.status, event);
      if (email) await mailer.send(email);
      dedup.remember(`kafka:${event.eventId}`);
    },
  });

  console.log(`[kafka] consuming ${TOPIC} as group notification-service`);
  return consumer;
}

module.exports = { startKafkaConsumer };
