package com.example.commerce.mbr;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MbrMapper {

    List<Map<String, Object>> selectMbrList(Map<String, Object> search);

    int selectMbrListCnt(Map<String, Object> search);

    Map<String, Object> selectMbr(String mbrId);

    int countHpNo(Map<String, Object> param);

    int insertMbr(Map<String, Object> param);

    int updateMbr(Map<String, Object> param);

    int updateGrade(Map<String, Object> param);

    int insertGradeHist(Map<String, Object> param);

    List<Map<String, Object>> selectGradeHist(Map<String, Object> search);

    Long selectCnfmAmt6m(String mbrId);

    /* 배치 */
    List<Map<String, Object>> selectGradeTargetList(Map<String, Object> param);

    List<Map<String, Object>> selectDormantTargetList(Map<String, Object> param);

    int updateDormant(Map<String, Object> param);
}
