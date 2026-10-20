package com.example.commerce.dlv;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DlvMapper {

    List<Map<String, Object>> selectDlvList(Map<String, Object> param);

    Map<String, Object> selectDlv(String dlvNo);

    Map<String, Object> selectDlvByOrdNo(String ordNo);

    int insertDlv(Map<String, Object> param);

    int updateDlvShip(Map<String, Object> param);

    int updateDlvCmpl(Map<String, Object> param);

    int updateLastTraceDt(String dlvNo);

    List<Map<String, Object>> selectTraceList(String dlvNo);

    int deleteTrace(String dlvNo);

    int insertTrace(Map<String, Object> param);

    List<Map<String, Object>> selectTraceTargetList(Map<String, Object> param);
}
