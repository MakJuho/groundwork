package com.example.commerce.pay;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PayMapper {

    List<Map<String, Object>> selectPayList(Map<String, Object> param);

    int selectPayListCnt(Map<String, Object> param);

    Map<String, Object> selectPay(String payNo);

    Map<String, Object> selectPayByOrdNo(String ordNo);

    Map<String, Object> selectPayForUpdate(String payNo);

    List<Map<String, Object>> selectCnclList(String payNo);

    Map<String, Object> selectLastFailCncl(String payNo);

    int selectNextCnclSeq(String payNo);

    int insertPay(Map<String, Object> param);

    int insertPayCncl(Map<String, Object> param);

    int updatePayStat(Map<String, Object> param);

    int updatePayCnclAmt(Map<String, Object> param);

    int updateCnclRetry(Map<String, Object> param);
}
