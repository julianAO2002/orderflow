const STATUS_EMAILS = {
  CREATED: (e) => ({
    subject: `Recibimos tu pedido ${e.orderId}`,
    text: `¡Gracias por tu compra!\n\nRegistramos tu pedido de ${e.quantity} unidad(es) del producto ${e.productId}.\nTe avisaremos cuando esté confirmado.`,
  }),
  CONFIRMED: (e) => ({
    subject: `Tu pedido ${e.orderId} fue confirmado`,
    text: `Confirmamos el stock de tu pedido (${e.quantity} x ${e.productId}). Lo estamos preparando.`,
  }),
  SHIPPED: (e) => ({
    subject: `Tu pedido ${e.orderId} está en camino`,
    text: `Tu pedido (${e.quantity} x ${e.productId}) fue enviado.`,
  }),
};

function buildEmail(status, event) {
  const template = STATUS_EMAILS[status];
  if (!template) return null;
  return { to: event.customerEmail, ...template(event) };
}

module.exports = { buildEmail };
