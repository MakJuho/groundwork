package com.example.commerce.ext;

import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 외부연동 송수신 로그. 업무 트랜잭션이 롤백되어도 로그는 남아야 하므로 별도 트랜잭션.
 */
@Service
public class IfLogService {

    private static final Logger log = LoggerFactory.getLogger(IfLogService.class);

    private final IfLogMapper ifLogMapper;

    public IfLogService(IfLogMapper ifLogMapper) {
        this.ifLogMapper = ifLogMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void write(String ifCd, String ifSvc, String url, String refNo,
                      Map<String, Object> req, Map<String, Object> res, long elapsedMs) {
        try {
            Map<String, Object> param = new HashMap<>();
            param.put("IF_CD", ifCd);
            param.put("IF_SVC", ifSvc);
            param.put("IF_URL", url);
            param.put("REF_NO", refNo);
            param.put("REQ_BODY", mask(req));
            param.put("RES_BODY", res == null ? null : String.valueOf(res));
            param.put("RES_CD", res == null ? null : res.get("RES_CD"));
            param.put("RES_MSG", res == null ? null : res.get("RES_MSG"));
            param.put("SUCC_YN", res != null && "0000".equals(String.valueOf(res.get("RES_CD"))) ? "Y" : "N");
            param.put("ELAPSED_MS", elapsedMs);
            ifLogMapper.insertIfLog(param);
        } catch (Exception e) {
            // 로그 적재 실패로 업무가 중단되면 안 된다
            log.error("if log insert fail [{}:{}] {}", ifCd, ifSvc, e.getMessage());
        }
    }

    /** 카드번호, 계좌번호 마스킹 */
    private String mask(Map<String, Object> req) {
        if (req == null) {
            return null;
        }
        Map<String, Object> copy = new HashMap<>(req);
        for (String key : new String[] {"CARD_NO", "ACCT_NO", "VBANK_NO", "HASH"}) {
            Object v = copy.get(key);
            if (v != null && String.valueOf(v).length() > 4) {
                String s = String.valueOf(v);
                copy.put(key, s.substring(0, 4) + "********");
            }
        }
        return String.valueOf(copy);
    }
}
