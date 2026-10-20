import { Router } from 'express';
import { cancelOrder, createOrder } from './order-service.js';

export const orderRouter = Router();
orderRouter.post('/', (req, res) => res.status(201).json(createOrder(req.user, req.body.items)));
orderRouter.post('/:id/cancel', (req, res) => res.json(cancelOrder(req.user, req.params.id)));
