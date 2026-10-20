package com.example.shop.product;

import com.example.shop.common.BizException;
import com.nexacro.java.xapi.data.DataSet;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductService {

    private final ProductMapper productMapper;

    public ProductService(ProductMapper productMapper) {
        this.productMapper = productMapper;
    }

    public List<ProductDto> findProducts(Map<String, Object> search) {
        return productMapper.selectProducts(search);
    }

    @Transactional
    public int saveProducts(List<ProductDto> products) {
        int count = 0;
        for (ProductDto product : products) {
            if (product.getPrice() <= 0) {
                throw new BizException("판매가는 0보다 커야 합니다: " + product.getProductCd());
            }
            if (product.getRowType() == DataSet.ROW_TYPE_INSERTED) {
                count += productMapper.insertProduct(product);
            } else if (product.getRowType() == DataSet.ROW_TYPE_UPDATED) {
                count += productMapper.updateProduct(product);
            }
        }
        return count;
    }
}
