package com.example.commerce.clm;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ClmMapper {

    List<Map<String, Object>> selectClmList(Map<String, Object> param);

    Map<String, Object> selectClm(String clmNo);

    List<Map<String, Object>> selectClmItemList(String clmNo);

    List<Map<String, Object>> selectClmListByOrd(String ordNo);

    /** 진행중(REQ/COL) 또는 완료(CMP)된 클레임에 포함된 주문상품 건수 */
    int selectActiveClmItemCnt(Map<String, Object> param);

    /** 해당 주문의 완료된 반품 클레임 건수 (현재 클레임 제외) */
    int selectCmpRtnClmCnt(Map<String, Object> param);

    int insertClm(Map<String, Object> param);

    int insertClmItem(Map<String, Object> param);

    int updateClmStat(Map<String, Object> param);

    int updateClmComplete(Map<String, Object> param);

    int updateClmReject(Map<String, Object> param);

    int updateClmItemRefund(Map<String, Object> param);
}
