package com.example.shop.order;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OrderMapper {

    List<OrderDto> selectOrders(Map<String, Object> search);

    OrderDto selectOrder(String orderNo);

    int updateOrderStat(Map<String, Object> param);
}
