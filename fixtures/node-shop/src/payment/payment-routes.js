import { Router } from 'express';
import { pay } from './payment-service.js';
import { orderRepository } from '../order/order-repository.js';

export const paymentRouter = Router();
paymentRouter.post('/', async (req, res) => {
  const order = orderRepository.findById(req.body.orderId);
  res.status(201).json(await pay(req.user, order, req.body));
});
