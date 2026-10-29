// Publishing failures are logged and do not fail the HTTP request: the order
// state is already committed when the events are emitted.
function createEventPublisher({ rabbit, kafka, logger = console }) {
  async function attempt(label, publish) {
    try {
      await publish();
      logger.log(`[events] ${label} published`);
    } catch (err) {
      logger.error(`[events] ${label} failed: ${err.message}`);
    }
  }

  return {
    orderCreated: (order) => Promise.all([
      attempt(`rabbitmq OrderCreated ${order.id}`, () => rabbit.publishOrderCreated(order)),
      attempt(`kafka ${order.status} ${order.id}`, () => kafka.publishStatusChanged(order, null)),
    ]),

    statusChanged: (order, previousStatus) =>
      attempt(`kafka ${order.status} ${order.id}`, () => kafka.publishStatusChanged(order, previousStatus)),
  };
}

module.exports = { createEventPublisher };
