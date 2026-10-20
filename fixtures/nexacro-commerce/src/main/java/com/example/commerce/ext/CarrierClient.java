package com.example.commerce.ext;

import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.ExtIfException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * 택배사 통합 연동 (송장 등록 / 배송 추적).
 * 택배사 코드는 공통코드 CARRIER 의 CD_VAL1 (중계사 기준 코드) 로 변환해서 보낸다.
 */
@Component
public class CarrierClient {

    private static final Logger log = LoggerFactory.getLogger(CarrierClient.class);

    private static final String IF_CD = "CARRIER";
    private static final String RES_OK = "0000";

    private final IfLogService ifLogService;
    private final CmmCodeService cmmCodeService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${commerce.carrier.url}")
    private String carrierUrl;

    public CarrierClient(IfLogService ifLogService, CmmCodeService cmmCodeService) {
        this.ifLogService = ifLogService;
        this.cmmCodeService = cmmCodeService;
    }

    /**
     * 송장 등록. req: CARRIER_CD, ORD_NO, DLV_NO, RCV_NM, RCV_HP, RCV_ZIP, RCV_ADDR, ITEM_NM, QTY
     * @return INVC_NO 포함 응답
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> register(Map<String, Object> req) {
        String carrierCd = CmmUtil.str(req, "CARRIER_CD");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("CARRIER", toIfCarrier(carrierCd));
        body.put("ORDER_REF", CmmUtil.str(req, "DLV_NO"));
        body.put("RCV_NM", CmmUtil.str(req, "RCV_NM"));
        body.put("RCV_TEL", CmmUtil.str(req, "RCV_HP").replaceAll("-", ""));
        body.put("RCV_ZIP", CmmUtil.str(req, "RCV_ZIP"));
        body.put("RCV_ADDR", CmmUtil.str(req, "RCV_ADDR"));
        body.put("GOODS_NM", CmmUtil.str(req, "ITEM_NM"));
        body.put("BOX_QTY", Math.max(1, CmmUtil.intg(req, "QTY")));
        body.put("REQ_DT", CmmUtil.now());

        String url = carrierUrl + "/api/v1/invoice";
        long start = System.currentTimeMillis();
        Map<String, Object> res = null;
        try {
            res = restTemplate.postForObject(url, body, Map.class);
        } catch (RestClientException e) {
            log.error("택배 송장등록 통신 오류 {} : {}", carrierCd, e.getMessage());
            res = errorRes("택배사 통신 오류");
        } finally {
            ifLogService.write(IF_CD, "REGISTER", url, CmmUtil.str(req, "ORD_NO"), body, res,
                    System.currentTimeMillis() - start);
        }
        check(res);
        if (CmmUtil.isEmpty(CmmUtil.str(res, "INVC_NO"))) {
            throw new ExtIfException(IF_CD, "E001", "송장번호가 발급되지 않았습니다.");
        }
        return res;
    }

    /**
     * 배송 추적. 중계사 상태코드를 배송 추적 상태로 변환한다.
     * 10 집하, 20/30 간선이동, 40 배송출발 → S(배송중), 50 배송완료 → D
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> trace(String carrierCd, String invcNo) {
        String url = carrierUrl + "/api/v1/trace?carrier=" + toIfCarrier(carrierCd) + "&invoice=" + invcNo;
        long start = System.currentTimeMillis();
        Map<String, Object> res = null;
        try {
            res = restTemplate.getForObject(url, Map.class);
        } catch (RestClientException e) {
            log.error("택배 추적 통신 오류 {} {} : {}", carrierCd, invcNo, e.getMessage());
            res = errorRes("택배사 통신 오류");
        } finally {
            ifLogService.write(IF_CD, "TRACE", url, invcNo, null, res, System.currentTimeMillis() - start);
        }
        check(res);

        List<Map<String, Object>> out = new ArrayList<>();
        Object events = res.get("EVENTS");
        if (!(events instanceof List)) {
            return out;
        }
        for (Object o : (List<Object>) events) {
            Map<String, Object> ev = (Map<String, Object>) o;
            String st = CmmUtil.str(ev, "STATUS");
            Map<String, Object> row = new HashMap<>();
            row.put("TRACE_STAT", "50".equals(st) ? "D" : "S");
            row.put("TRACE_STAT_NM", CmmUtil.str(ev, "STATUS_NM"));
            row.put("TRACE_LOC", CmmUtil.str(ev, "LOCATION"));
            row.put("TRACE_DT", CmmUtil.str(ev, "EVENT_DT")); // yyyyMMddHHmmss
            out.add(row);
        }
        return out;
    }

    private String toIfCarrier(String carrierCd) {
        String v = cmmCodeService.getCodeVal("CARRIER", carrierCd);
        if (CmmUtil.isEmpty(v)) {
            throw new ExtIfException(IF_CD, "E000", "등록되지 않은 택배사입니다: " + carrierCd);
        }
        return v;
    }

    private void check(Map<String, Object> res) {
        String resCd = res == null ? "9999" : CmmUtil.str(res, "RES_CD");
        if (!RES_OK.equals(resCd)) {
            throw new ExtIfException(IF_CD, resCd, res == null ? "응답 없음" : CmmUtil.str(res, "RES_MSG"));
        }
    }

    private Map<String, Object> errorRes(String msg) {
        Map<String, Object> m = new HashMap<>();
        m.put("RES_CD", "9999");
        m.put("RES_MSG", msg);
        return m;
    }
}
