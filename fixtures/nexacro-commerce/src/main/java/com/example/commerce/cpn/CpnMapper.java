package com.example.commerce.cpn;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CpnMapper {

    List<Map<String, Object>> selectCpnList(Map<String, Object> param);

    Map<String, Object> selectCpn(String cpnId);

    int insertCpn(Map<String, Object> param);

    int updateCpn(Map<String, Object> param);

    int updateCpnUseN(Map<String, Object> param);

    int updateIssueCnt(String cpnId);

    List<Map<String, Object>> selectIssueList(Map<String, Object> param);

    Map<String, Object> selectIssue(String issueNo);

    int selectMbrIssueCnt(Map<String, Object> param);

    int insertIssue(Map<String, Object> param);

    int updateIssueUse(Map<String, Object> param);

    Map<String, Object> selectUsedIssueByOrd(String ordNo);

    int updateIssueRestore(String issueNo);
}
