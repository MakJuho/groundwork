package com.example.shop.order;

public class OrderDto {

    private String orderNo;
    private String memberId;
    private String orderStat;
    private long totalAmt;
    private String orderDt;

    public String getOrderNo() { return orderNo; }
    public void setOrderNo(String orderNo) { this.orderNo = orderNo; }
    public String getMemberId() { return memberId; }
    public void setMemberId(String memberId) { this.memberId = memberId; }
    public String getOrderStat() { return orderStat; }
    public void setOrderStat(String orderStat) { this.orderStat = orderStat; }
    public long getTotalAmt() { return totalAmt; }
    public void setTotalAmt(long totalAmt) { this.totalAmt = totalAmt; }
    public String getOrderDt() { return orderDt; }
    public void setOrderDt(String orderDt) { this.orderDt = orderDt; }
}
