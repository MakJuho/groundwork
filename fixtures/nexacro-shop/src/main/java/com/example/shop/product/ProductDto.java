package com.example.shop.product;

import com.nexacro.uiadapter.spring.core.data.DataSetRowTypeAccessor;

public class ProductDto implements DataSetRowTypeAccessor {

    private int rowType;
    private String productCd;
    private String productNm;
    private long price;
    private int stockQty;

    @Override
    public int getRowType() { return rowType; }
    @Override
    public void setRowType(int rowType) { this.rowType = rowType; }

    public String getProductCd() { return productCd; }
    public void setProductCd(String productCd) { this.productCd = productCd; }
    public String getProductNm() { return productNm; }
    public void setProductNm(String productNm) { this.productNm = productNm; }
    public long getPrice() { return price; }
    public void setPrice(long price) { this.price = price; }
    public int getStockQty() { return stockQty; }
    public void setStockQty(int stockQty) { this.stockQty = stockQty; }
}
