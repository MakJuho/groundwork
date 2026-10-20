package com.example.shop.order;

import com.example.shop.common.BizException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    /** 주문 상태: 10 주문접수, 20 결제완료, 30 배송중, 40 배송완료, 90 주문취소 */
    static final String STAT_RECEIVED = "10";
    static final String STAT_CANCELED = "90";

    private final OrderMapper orderMapper;

    public OrderService(OrderMapper orderMapper) {
        this.orderMapper = orderMapper;
    }

    public List<OrderDto> findOrders(Map<String, Object> search) {
        return orderMapper.selectOrders(search);
    }

    @Transactional
    public void cancelOrder(String orderNo) {
        OrderDto order = orderMapper.selectOrder(orderNo);
        if (order == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + orderNo);
        }
        if (!STAT_RECEIVED.equals(order.getOrderStat())) {
            throw new BizException("주문접수 상태에서만 취소할 수 있습니다.");
        }
        Map<String, Object> param = new HashMap<>();
        param.put("orderNo", orderNo);
        param.put("orderStat", STAT_CANCELED);
        orderMapper.updateOrderStat(param);
    }
}
