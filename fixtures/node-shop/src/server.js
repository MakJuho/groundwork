import express from 'express';
import { orderRouter } from './order/order-routes.js';
import { paymentRouter } from './payment/payment-routes.js';

const app = express();
app.use(express.json());
app.use('/api/orders', orderRouter);
app.use('/api/payments', paymentRouter);
app.listen(3000);
