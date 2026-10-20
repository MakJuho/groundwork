import { DAILY_CARD_LIMIT, INSTALLMENT_MIN_AMOUNT, MAX_INSTALLMENT_MONTHS, MAX_POINT_RATIO, MIN_POINT_USE, PAYMENT_EXPIRE_MINUTES, PAYMENT_METHODS, PG_MAX_RETRY, RETURN_SHIPPING_FEE } from './payment-policy.js';
import { pgClient } from './pg-client.js';
import { paymentRepository } from './payment-repository.js';

export class PaymentError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function pay(user, order, { method, usePoint = 0, installmentMonths = 0 }) {
  if (!PAYMENT_METHODS.includes(method)) throw new PaymentError('UNSUPPORTED_METHOD', '지원하지 않는 결제 수단입니다.');
  const expiresAt = order.createdAt.getTime() + PAYMENT_EXPIRE_MINUTES * 60 * 1000;
  if (Date.now() > expiresAt) throw new PaymentError('PAYMENT_EXPIRED', '결제 가능 시간이 지났습니다.');
  if (usePoint > 0 && usePoint < MIN_POINT_USE) throw new PaymentError('POINT_TOO_SMALL', `포인트는 ${MIN_POINT_USE}점 이상부터 사용할 수 있습니다.`);
  if (usePoint > order.amount * MAX_POINT_RATIO) throw new PaymentError('POINT_OVER_LIMIT', '포인트는 주문 금액의 50%까지 사용할 수 있습니다.');
  if (installmentMonths > 0) {
    if (order.amount < INSTALLMENT_MIN_AMOUNT) throw new PaymentError('INSTALLMENT_NOT_ALLOWED', '5만원 이상 결제 시에만 할부가 가능합니다.');
    if (installmentMonths > MAX_INSTALLMENT_MONTHS) throw new PaymentError('INSTALLMENT_TOO_LONG', `할부는 최대 ${MAX_INSTALLMENT_MONTHS}개월입니다.`);
  }
  if (method === 'CARD') {
    const todayTotal = paymentRepository.sumCardAmountToday(user.id);
    if (todayTotal + order.amount > DAILY_CARD_LIMIT) throw new PaymentError('DAILY_LIMIT_EXCEEDED', '일일 카드 결제 한도를 초과했습니다.');
  }
  const chargeAmount = order.amount + order.shippingFee - usePoint;
  const result = await requestWithRetry(() => pgClient.charge({ method, amount: chargeAmount, installmentMonths }));
  return paymentRepository.save({ orderId: order.id, userId: user.id, method, amount: chargeAmount, usePoint, pgTxId: result.txId, paidAt: new Date() });
}

async function requestWithRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= PG_MAX_RETRY) throw err;
    }
  }
}

export async function refund(order, payment) {
  const shipped = order.status === 'SHIPPED' || order.status === 'DELIVERED';
  const refundAmount = shipped ? payment.amount - RETURN_SHIPPING_FEE : payment.amount;
  await pgClient.refund({ txId: payment.pgTxId, amount: refundAmount });
  return { refundAmount };
}
