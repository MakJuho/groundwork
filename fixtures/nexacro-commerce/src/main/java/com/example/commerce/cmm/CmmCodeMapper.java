package com.example.commerce.cmm;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CmmCodeMapper {

    List<Map<String, Object>> selectCodeList(Map<String, Object> param);

    String selectCodeVal(Map<String, Object> param);

    int mergeCode(Map<String, Object> param);

    int deleteCode(Map<String, Object> param);
}
