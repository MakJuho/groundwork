package com.example.commerce.dlv;

import java.util.List;
import java.util.Map;

/**
 * 배송 서비스
 */
public interface DlvService {

    /** 배송 생성 (상품준비 시) */
    void createDlv(String ordNo);

    /** 주문 배송정보. DLV_CMPL_DT는 yyyyMMdd */
    Map<String, Object> getDlv(String ordNo);

    List<Map<String, Object>> selectDlvList(Map<String, Object> search);

    List<Map<String, Object>> selectTraceList(String dlvNo);

    /** 출고 (송장 등록) */
    int shipDlv(List<Map<String, Object>> list, String userId);

    /** 배송완료 */
    void completeDlv(String dlvNo, String userId);

    /** 배송조회 (택배사 추적) */
    List<Map<String, Object>> trackDlv(String dlvNo);

    /** 배송추적 대상 (배송중) */
    List<Map<String, Object>> selectTraceTargetList();
}
