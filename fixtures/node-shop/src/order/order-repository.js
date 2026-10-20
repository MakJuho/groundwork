const orders = new Map();
let seq = 0;

export const orderRepository = {
  save(order) {
    if (!order.id) order.id = ++seq;
    orders.set(order.id, order);
    return order;
  },
  findById(id) {
    return orders.get(Number(id));
  },
};
