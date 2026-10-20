package com.example.commerce.pay;

import java.util.List;
import java.util.Map;

/**
 * 결제 서비스.
 */
public interface PayService {

    /** 결제 목록 (화면) */
    List<Map<String, Object>> selectPayList(Map<String, Object> search);

    int selectPayListCnt(Map<String, Object> search);

    /** 결제 상세 + 취소이력 */
    Map<String, Object> selectPayDetail(String payNo);

    List<Map<String, Object>> selectCnclList(String payNo);

    /** 주문의 결제건. 없으면 null */
    Map<String, Object> getPay(String ordNo);

    /** 승인 (할부 검사 포함) */
    Map<String, Object> approve(Map<String, Object> req);

    /** 전체취소 */
    void cancelAll(String ordNo, String rsn);

    /** 부분취소. clmNo는 반품에서 온 경우만 */
    void cancelPart(String ordNo, long cnclAmt, String rsn, String clmNo);

    /** 취소실패(E) 건 재처리 */
    void retryCancel(String payNo, String chgId);

    /** 할부 조건 검사 */
    void checkInstallment(String cardCo, int instMm, String freeInstYn, long payAmt);
}
