package com.example.commerce.ext;

import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.ExtIfException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * PG 연동 (승인 / 전체취소 / 부분취소).
 * 응답 RES_CD "0000" 이 성공, 그 외는 ExtIfException.
 */
@Component
public class PgClient {

    private static final Logger log = LoggerFactory.getLogger(PgClient.class);

    private static final String IF_CD = "PG";
    private static final String RES_OK = "0000";
    /** 통신 오류(타임아웃 등) 시 내부 응답코드 */
    private static final String RES_NETWORK_ERR = "9999";

    private final IfLogService ifLogService;
    private final RestTemplate restTemplate;

    @Value("${commerce.pg.url}")
    private String pgUrl;

    @Value("${commerce.pg.mid}")
    private String mid;

    public PgClient(IfLogService ifLogService, @Value("${commerce.pg.timeout-ms:5000}") int timeoutMs) {
        this.ifLogService = ifLogService;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(timeoutMs);
        factory.setReadTimeout(timeoutMs);
        this.restTemplate = new RestTemplate(factory);
    }

    /** 승인. req: ORD_NO, PAY_MTHD, CARD_CO, INST_MM, FREE_INST_YN, PAY_AMT, BILL_KEY */
    public Map<String, Object> approve(Map<String, Object> req) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("MID", mid);
        body.put("ORD_NO", CmmUtil.str(req, "ORD_NO"));
        body.put("PAY_MTHD", CmmUtil.str(req, "PAY_MTHD"));
        body.put("CARD_CO", CmmUtil.str(req, "CARD_CO"));
        body.put("INST_MM", String.format("%02d", CmmUtil.intg(req, "INST_MM")));
        body.put("FREE_INST_YN", "Y".equals(CmmUtil.str(req, "FREE_INST_YN")) ? "Y" : "N");
        body.put("AMT", CmmUtil.lng(req, "PAY_AMT"));
        body.put("BILL_KEY", CmmUtil.str(req, "BILL_KEY"));
        body.put("REQ_DT", CmmUtil.now());
        body.put("HASH", hash(mid + body.get("ORD_NO") + body.get("AMT") + body.get("REQ_DT")));
        return call("APPROVE", "/v2/payments/approve", CmmUtil.str(req, "ORD_NO"), body);
    }

    /** 전체취소 */
    public Map<String, Object> cancel(String pgTid, long amt, String rsn) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("MID", mid);
        body.put("TID", pgTid);
        body.put("CNCL_AMT", amt);
        body.put("CNCL_RSN", cut(rsn, 100));
        body.put("PART_CNCL_YN", "N");
        body.put("REQ_DT", CmmUtil.now());
        body.put("HASH", hash(mid + pgTid + amt + body.get("REQ_DT")));
        return call("CANCEL", "/v2/payments/cancel", pgTid, body);
    }

    /**
     * 부분취소. remainAmt는 취소 후 남는 승인금액으로, PG가 자기 잔액과 맞지 않으면 거절(RES_CD 3011)한다.
     */
    public Map<String, Object> partialCancel(String pgTid, long amt, long remainAmt, String rsn) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("MID", mid);
        body.put("TID", pgTid);
        body.put("CNCL_AMT", amt);
        body.put("REMAIN_AMT", remainAmt);
        body.put("CNCL_RSN", cut(rsn, 100));
        body.put("PART_CNCL_YN", "Y");
        body.put("REQ_DT", CmmUtil.now());
        body.put("HASH", hash(mid + pgTid + amt + remainAmt + body.get("REQ_DT")));
        return call("PART_CANCEL", "/v2/payments/cancel", pgTid, body);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> call(String svc, String path, String refNo, Map<String, Object> body) {
        String url = pgUrl + path;
        long start = System.currentTimeMillis();
        Map<String, Object> res = null;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-PG-MID", mid);
            res = restTemplate.postForObject(url, new HttpEntity<>(body, headers), Map.class);
        } catch (RestClientException e) {
            log.error("PG {} 통신 오류 ref={} : {}", svc, refNo, e.getMessage());
            res = new HashMap<>();
            res.put("RES_CD", RES_NETWORK_ERR);
            res.put("RES_MSG", "PG 통신 오류");
        } finally {
            ifLogService.write(IF_CD, svc, url, refNo, body, res, System.currentTimeMillis() - start);
        }
        if (res == null) {
            throw new ExtIfException(IF_CD, RES_NETWORK_ERR, "PG 응답 없음");
        }
        String resCd = CmmUtil.str(res, "RES_CD");
        if (!RES_OK.equals(resCd)) {
            log.warn("PG {} 실패 ref={} resCd={} msg={}", svc, refNo, resCd, res.get("RES_MSG"));
            throw new ExtIfException(IF_CD, resCd, CmmUtil.str(res, "RES_MSG"));
        }
        // PG 응답 키 표준화 (TID → PG_TID, CNCL_TID → PG_CNCL_TID)
        Map<String, Object> out = new HashMap<>(res);
        if (res.containsKey("TID")) {
            out.put("PG_TID", res.get("TID"));
        }
        if (res.containsKey("CNCL_TID")) {
            out.put("PG_CNCL_TID", res.get("CNCL_TID"));
        }
        log.info("PG {} 성공 ref={} {}ms", svc, refNo, System.currentTimeMillis() - start);
        return out;
    }

    private String hash(String src) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(src.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new ExtIfException(IF_CD, "HASH", "해시 생성 실패");
        }
    }

    private String cut(String s, int len) {
        if (s == null) {
            return "";
        }
        return s.length() > len ? s.substring(0, len) : s;
    }
}
