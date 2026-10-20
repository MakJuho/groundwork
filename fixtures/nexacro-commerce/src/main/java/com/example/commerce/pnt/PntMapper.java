package com.example.commerce.pnt;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PntMapper {

    List<Map<String, Object>> selectLedgerList(Map<String, Object> param);

    Map<String, Object> selectBal(String mbrId);

    Map<String, Object> selectLedger(String ledgerNo);

    /** 사용 가능한 적립건 (유효기간 임박순) */
    List<Map<String, Object>> selectUsableEarnList(Map<String, Object> param);

    /** 주문의 사용건 중 취소 가능 잔액이 남은 것 (최근 사용순) */
    List<Map<String, Object>> selectCancelableUseList(String ordNo);

    List<Map<String, Object>> selectEarnListByOrd(String ordNo);

    int selectEarnCntByOrd(String ordNo);

    List<Map<String, Object>> selectExpireTargetList(String baseDt);

    int insertLedger(Map<String, Object> param);

    int updateRemainAmt(Map<String, Object> param);

    int mergeBal(Map<String, Object> param);
}
