package com.example.commerce.cmm;

import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 채번. 접두어 + 일자(yyyyMMdd) + 일련번호 6자리.
 * 예) ORD20261019000123, PAY..., CLM..., STL..., DLV..., PNT..., CPI...
 */
@Service
public class SeqService {

    private final SeqMapper seqMapper;

    public SeqService(SeqMapper seqMapper) {
        this.seqMapper = seqMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String next(String prefix) {
        String ymd = CmmUtil.today();
        Map<String, Object> param = new HashMap<>();
        param.put("SEQ_ID", prefix);
        param.put("SEQ_YMD", ymd);
        Long seq = seqMapper.selectNextSeq(param);
        if (seq == null) {
            seqMapper.insertSeq(param);
            seq = 1L;
        }
        return prefix + ymd + String.format("%06d", seq);
    }
}
