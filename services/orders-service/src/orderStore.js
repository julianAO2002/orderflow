const { randomUUID } = require('node:crypto');

const STATUS = Object.freeze({
  CREATED: 'CREATED',
  CONFIRMED: 'CONFIRMED',
  SHIPPED: 'SHIPPED',
});

const ALLOWED_TRANSITIONS = {
  [STATUS.CREATED]: [STATUS.CONFIRMED],
  [STATUS.CONFIRMED]: [STATUS.SHIPPED],
  [STATUS.SHIPPED]: [],
};

class OrderNotFoundError extends Error {}
class InvalidTransitionError extends Error {}

function createOrderStore() {
  const orders = new Map();

  function get(id) {
    const order = orders.get(id);
    if (!order) throw new OrderNotFoundError(`Order ${id} not found`);
    return order;
  }

  return {
    list: () => [...orders.values()],
    get,

    create({ productId, quantity, customerEmail }) {
      const now = new Date().toISOString();
      const order = {
        id: randomUUID(),
        productId,
        quantity,
        customerEmail,
        status: STATUS.CREATED,
        history: [{ status: STATUS.CREATED, at: now }],
        createdAt: now,
      };
      orders.set(order.id, order);
      return order;
    },

    assertCanTransition(id, next) {
      const order = get(id);
      if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
        throw new InvalidTransitionError(`Order ${id} cannot go from ${order.status} to ${next}`);
      }
      return order;
    },

    transition(id, next) {
      const order = this.assertCanTransition(id, next);
      const previousStatus = order.status;
      order.status = next;
      order.history.push({ status: next, at: new Date().toISOString() });
      return { order, previousStatus };
    },
  };
}

module.exports = { createOrderStore, STATUS, OrderNotFoundError, InvalidTransitionError };
