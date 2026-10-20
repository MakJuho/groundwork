package com.example.commerce.stl;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface StlMapper {

    List<Map<String, Object>> selectStlList(Map<String, Object> param);

    int selectStlListCnt(Map<String, Object> param);

    Map<String, Object> selectStlSum(Map<String, Object> param);

    Map<String, Object> selectStl(String stlNo);

    Map<String, Object> selectStlByItem(Map<String, Object> param);

    List<Map<String, Object>> selectStlPayList(Map<String, Object> param);

    List<Map<String, Object>> selectStlPayItemList(Map<String, Object> param);

    int insertStl(Map<String, Object> param);

    int updateStlCncl(Map<String, Object> param);

    int updateStlHold(Map<String, Object> param);

    int updateStlRelease(Map<String, Object> param);

    int updateStlManualConfirm(Map<String, Object> param);

    int mergeStlPay(Map<String, Object> param);

    void callStlConfirm(Map<String, Object> param);

    int updateHoldSuspendedSeller(Map<String, Object> param);

    List<Map<String, Object>> selectPayTargetSeller(Map<String, Object> param);

    int updateStlPaid(Map<String, Object> param);

    int updateStlPayPaid(Map<String, Object> param);

    int selectHolidayCnt(String ymd);
}
