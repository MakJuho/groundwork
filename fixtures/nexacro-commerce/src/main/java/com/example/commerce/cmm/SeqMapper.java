package com.example.commerce.cmm;

import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SeqMapper {

    Long selectNextSeq(Map<String, Object> param);

    int insertSeq(Map<String, Object> param);
}
