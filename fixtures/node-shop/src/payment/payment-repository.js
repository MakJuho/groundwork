const payments = [];

export const paymentRepository = {
  save(payment) {
    payments.push(payment);
    return payment;
  },
  sumCardAmountToday(userId) {
    const today = new Date().toDateString();
    return payments
      .filter((p) => p.userId === userId && p.method === 'CARD' && p.paidAt.toDateString() === today)
      .reduce((sum, p) => sum + p.amount, 0);
  },
};
