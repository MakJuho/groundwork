package com.example.commerce.ext;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface IfLogMapper {

    int insertIfLog(Map<String, Object> param);

    List<Map<String, Object>> selectIfLogList(Map<String, Object> param);
}
