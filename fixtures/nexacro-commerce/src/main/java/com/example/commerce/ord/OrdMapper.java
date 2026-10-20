package com.example.commerce.ord;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OrdMapper {

    List<Map<String, Object>> selectOrdList(Map<String, Object> param);

    int selectOrdListCnt(Map<String, Object> param);

    Map<String, Object> selectOrd(String ordNo);

    Map<String, Object> selectOrdForUpdate(String ordNo);

    List<Map<String, Object>> selectOrdItemList(String ordNo);

    Map<String, Object> selectOrdItem(Map<String, Object> param);

    List<Map<String, Object>> selectStatHistList(String ordNo);

    List<Map<String, Object>> selectAutoCnfmTargetList(Map<String, Object> param);

    int updateOrdStat(Map<String, Object> param);

    int insertStatHist(Map<String, Object> param);

    int updateItemStat(Map<String, Object> param);

    int updateItemCncl(Map<String, Object> param);

    int updateOrdCnclAmt(Map<String, Object> param);
}
