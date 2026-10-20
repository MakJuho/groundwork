package com.example.shop.product;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ProductMapper {

    List<ProductDto> selectProducts(Map<String, Object> search);

    int insertProduct(ProductDto product);

    int updateProduct(ProductDto product);
}
