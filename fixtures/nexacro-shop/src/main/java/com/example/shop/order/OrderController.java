package com.example.shop.order;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/order")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @RequestMapping("/list.do")
    public NexacroResult list(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_order", orderService.findOrders(search));
        return result;
    }

    @RequestMapping("/cancel.do")
    public NexacroResult cancel(@ParamDataSet(name = "ds_cancel") Map<String, Object> cancel) {
        orderService.cancelOrder((String) cancel.get("ORDER_NO"));
        return new NexacroResult();
    }
}
