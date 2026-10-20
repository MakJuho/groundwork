import { ALLOWED_TRANSITIONS, CANCEL_WINDOW_DAYS, FREE_SHIPPING_THRESHOLD, MAX_ITEMS_PER_ORDER, MIN_ORDER_AMOUNT, OrderStatus, SHIPPING_FEE, VIP_DISCOUNT_RATE } from './order-policy.js';
import { orderRepository } from './order-repository.js';

export class OrderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createOrder(user, items) {
  if (!items || items.length === 0) throw new OrderError('EMPTY_ORDER', '주문 상품이 없습니다.');
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (quantity > MAX_ITEMS_PER_ORDER) throw new OrderError('TOO_MANY_ITEMS', `한 주문에 최대 ${MAX_ITEMS_PER_ORDER}개까지 담을 수 있습니다.`);
  let amount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (amount < MIN_ORDER_AMOUNT) throw new OrderError('BELOW_MIN_AMOUNT', '최소 주문 금액 미만입니다.');
  if (user.grade === 'VIP') amount = Math.floor(amount * (1 - VIP_DISCOUNT_RATE));
  const shippingFee = amount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return orderRepository.save({ userId: user.id, items, amount, shippingFee, status: OrderStatus.PENDING, createdAt: new Date() });
}

export function changeStatus(order, next) {
  if (!ALLOWED_TRANSITIONS[order.status].includes(next)) throw new OrderError('INVALID_TRANSITION', `${order.status} -> ${next} 변경 불가`);
  order.status = next;
  return orderRepository.save(order);
}

export function cancelOrder(user, orderId) {
  const order = orderRepository.findById(orderId);
  if (order.userId !== user.id && user.role !== 'ADMIN') throw new OrderError('FORBIDDEN', '본인 주문만 취소할 수 있습니다.');
  if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) throw new OrderError('ALREADY_SHIPPED', '배송이 시작된 주문은 취소할 수 없습니다.');
  const baseDate = order.paidAt ?? order.createdAt;
  const elapsedDays = (Date.now() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
  if (elapsedDays > CANCEL_WINDOW_DAYS) throw new OrderError('CANCEL_WINDOW_PASSED', `결제 후 ${CANCEL_WINDOW_DAYS}일이 지나 취소할 수 없습니다.`);
  return changeStatus(order, OrderStatus.CANCELLED);
}
