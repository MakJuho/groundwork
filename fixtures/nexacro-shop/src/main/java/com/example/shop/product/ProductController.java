package com.example.shop.product;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/product")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @RequestMapping("/list.do")
    public NexacroResult list(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_product", productService.findProducts(search));
        return result;
    }

    @RequestMapping("/save.do")
    public NexacroResult save(@ParamDataSet(name = "ds_product") List<ProductDto> products) {
        int count = productService.saveProducts(products);
        Map<String, Object> row = new HashMap<>();
        row.put("RESULT_CNT", count);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_result", List.of(row));
        return result;
    }
}
