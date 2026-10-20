package com.example.commerce.clm;

import java.util.List;
import java.util.Map;

/**
 * 클레임(반품·환불) 서비스.
 */
public interface ClmService {

    List<Map<String, Object>> selectClmList(Map<String, Object> search);

    /**
     * 클레임 상세. CLM_NO 가 있으면 클레임/클레임상품, ORD_NO 기준으로 주문/주문상품(반품 접수용)을 함께 돌려준다.
     * @return 키: ds_clm, ds_clmItem, ds_ord, ds_ordItem
     */
    Map<String, List<Map<String, Object>>> selectClmDetail(String clmNo, String ordNo);

    /** 반품 접수. @return 클레임번호 */
    String requestReturn(Map<String, Object> clm, List<Map<String, Object>> itemList, String userId);

    /** 회수 완료 → 환불. @return 환불금액 */
    long completeReturn(String clmNo, String userId);

    void rejectClm(String clmNo, String rejRsn, String userId);

    /** 반품 환불금액 계산 (클레임상품별 쿠폰할인 차감액·환불액도 채운다) */
    long calcRefundAmt(Map<String, Object> clm, List<Map<String, Object>> clmItemList, Map<String, Object> ord);
}
