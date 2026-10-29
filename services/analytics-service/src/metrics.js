function createMetrics() {
  const seenEvents = new Set();
  const ordersByStatus = {};
  const currentStatus = new Map();
  const unitsConfirmedByProduct = {};
  const createdAt = new Map();
  const confirmationTimesMs = [];
  let totalEvents = 0;
  let lastEventAt = null;

  return {
    apply(event) {
      if (seenEvents.has(event.eventId)) return false;
      seenEvents.add(event.eventId);
      totalEvents += 1;
      lastEventAt = event.occurredAt;

      const previous = currentStatus.get(event.orderId);
      if (previous) ordersByStatus[previous] -= 1;
      ordersByStatus[event.status] = (ordersByStatus[event.status] ?? 0) + 1;
      currentStatus.set(event.orderId, event.status);

      if (event.status === 'CREATED') createdAt.set(event.orderId, Date.parse(event.occurredAt));
      if (event.status === 'CONFIRMED') {
        unitsConfirmedByProduct[event.productId] = (unitsConfirmedByProduct[event.productId] ?? 0) + event.quantity;
        const start = createdAt.get(event.orderId);
        if (start !== undefined) confirmationTimesMs.push(Date.parse(event.occurredAt) - start);
      }
      return true;
    },

    snapshot() {
      const avg = confirmationTimesMs.length
        ? confirmationTimesMs.reduce((a, b) => a + b, 0) / confirmationTimesMs.length
        : null;
      return {
        totalEvents,
        totalOrders: currentStatus.size,
        ordersByStatus: { ...ordersByStatus },
        unitsConfirmedByProduct: { ...unitsConfirmedByProduct },
        avgSecondsToConfirm: avg === null ? null : Number((avg / 1000).toFixed(2)),
        lastEventAt,
      };
    },
  };
}

module.exports = { createMetrics };
