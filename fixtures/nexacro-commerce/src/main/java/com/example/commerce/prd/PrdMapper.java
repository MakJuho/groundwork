package com.example.commerce.prd;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PrdMapper {

    List<Map<String, Object>> selectPrdList(Map<String, Object> search);

    Map<String, Object> selectPrd(String prdCd);

    Map<String, Object> selectPrdCommBase(String prdCd);

    int insertPrd(Map<String, Object> param);

    int updatePrd(Map<String, Object> param);

    List<Map<String, Object>> selectCtgList(Map<String, Object> search);

    Map<String, Object> selectCtg(String ctgCd);

    int countChildCtg(String ctgCd);

    int countPrdByCtg(String ctgCd);

    int mergeCtg(Map<String, Object> param);

    int deleteCtg(String ctgCd);

    Map<String, Object> selectSeller(String sellerId);

    int updateSellerStat(Map<String, Object> param);

    int updatePrdStopBySeller(Map<String, Object> param);
}
