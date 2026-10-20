package com.example.commerce.dlv;

import com.example.commerce.cmm.CmmUtil;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 배송추적 배치. 2시간마다 배송중(S) 건을 택배사에 조회해 배달완료면 배송완료 처리한다.
 */
@Component
public class DlvTraceBatch {

    private static final Logger log = LoggerFactory.getLogger(DlvTraceBatch.class);

    private final DlvService dlvService;

    public DlvTraceBatch(DlvService dlvService) {
        this.dlvService = dlvService;
    }

    // 2020.02 택배사 조회 한도 문제로 1시간 -> 2시간
    @Scheduled(cron = "0 10 */2 * * *")
    public void run() {
        List<Map<String, Object>> targets = dlvService.selectTraceTargetList();
        log.info("[DlvTraceBatch] start target={}", targets.size());
        int ok = 0;
        int fail = 0;
        for (Map<String, Object> t : targets) {
            String dlvNo = CmmUtil.str(t, "DLV_NO");
            try {
                dlvService.trackDlv(dlvNo);
                ok++;
            } catch (Exception e) {
                fail++;
                log.warn("[DlvTraceBatch] trace fail dlvNo={} msg={}", dlvNo, e.getMessage());
            }
        }
        log.info("[DlvTraceBatch] end ok={} fail={}", ok, fail);
    }
}
