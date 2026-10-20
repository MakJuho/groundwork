package com.example.commerce.pay;

import com.example.commerce.cmm.ExtIfException;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * PG 취소 실패 기록. 호출한 업무 트랜잭션은 롤백되지만 실패 이력은 남아야 재처리할 수 있다.
 */
@Service
public class PayCnclFailService {

    private static final Logger log = LoggerFactory.getLogger(PayCnclFailService.class);

    private final PayMapper payMapper;

    public PayCnclFailService(PayMapper payMapper) {
        this.payMapper = payMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFail(String payNo, String cnclType, long cnclAmt, long remainAmt,
                           String rsn, String clmNo, ExtIfException e) {
        log.warn("PG 취소 실패 기록 payNo={} type={} amt={} resCd={}", payNo, cnclType, cnclAmt, e.getResCd());

        Map<String, Object> cncl = new HashMap<>();
        cncl.put("PAY_NO", payNo);
        cncl.put("CNCL_SEQ", payMapper.selectNextCnclSeq(payNo));
        cncl.put("CNCL_TYPE", cnclType);
        cncl.put("CNCL_AMT", cnclAmt);
        cncl.put("REMAIN_AMT", remainAmt);
        cncl.put("CNCL_RSN", rsn);
        cncl.put("CLM_NO", clmNo);
        cncl.put("CNCL_STAT", "F");
        cncl.put("PG_RES_CD", e.getResCd());
        cncl.put("PG_RES_MSG", e.getMessage());
        payMapper.insertPayCncl(cncl);

        Map<String, Object> stat = new HashMap<>();
        stat.put("PAY_NO", payNo);
        stat.put("PAY_STAT", "E");
        payMapper.updatePayStat(stat);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRetryFail(String payNo, int cnclSeq, ExtIfException e) {
        Map<String, Object> p = new HashMap<>();
        p.put("PAY_NO", payNo);
        p.put("CNCL_SEQ", cnclSeq);
        p.put("CNCL_STAT", "F");
        p.put("PG_RES_CD", e.getResCd());
        p.put("PG_RES_MSG", e.getMessage());
        payMapper.updateCnclRetry(p);
    }
}
