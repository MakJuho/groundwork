package com.example.commerce.mbr;

import java.util.List;
import java.util.Map;

/**
 * 회원 서비스.
 * 타 모듈(주문, 포인트, 쿠폰)에서는 getMbr / getGradeCd 만 사용한다.
 */
public interface MbrService {

    /** 회원 목록 조회 (회원관리 화면) */
    List<Map<String, Object>> selectMbrList(Map<String, Object> search);

    /** 회원 저장 (추가/수정) */
    int saveMbrList(List<Map<String, Object>> list, String userId);

    /** 회원 단건. 없으면 BizException */
    Map<String, Object> getMbr(String mbrId);

    /** 회원 현재 등급코드 */
    String getGradeCd(String mbrId);

    /** 등급 변경 이력 */
    List<Map<String, Object>> selectGradeHist(Map<String, Object> search);

    /** 관리자 등급 수동 변경 */
    void changeGrade(Map<String, Object> param, String userId);

    /** 직전 6개월 구매확정 금액 */
    long getCnfmAmt6m(String mbrId);
}
