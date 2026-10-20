package com.example.commerce.stk;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface StkMapper {

    List<Map<String, Object>> selectStkList(Map<String, Object> search);

    /** 재고 행 잠금 조회 (SELECT ... FOR UPDATE) */
    Map<String, Object> selectStkForUpdate(String prdCd);

    int updateStk(Map<String, Object> param);

    int updateSafeQty(Map<String, Object> param);

    int insertStkHist(Map<String, Object> param);
}
