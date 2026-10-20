export const MAX_ITEMS_PER_ORDER = 50;
export const MIN_ORDER_AMOUNT = 10000;
export const FREE_SHIPPING_THRESHOLD = 50000;
export const SHIPPING_FEE = 3000;
export const VIP_DISCOUNT_RATE = 0.05;
export const CANCEL_WINDOW_DAYS = 7;

export const OrderStatus = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

export const ALLOWED_TRANSITIONS = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
