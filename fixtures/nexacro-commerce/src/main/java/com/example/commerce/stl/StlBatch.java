package com.example.commerce.stl;

import com.example.commerce.cmm.CmmUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 정산 배치.
 *  - 정산 확정: 매일 (commerce.stl.batch-cron)
 *  - 지급: 매일 09시, 지급예정일 도래분
 */
@Component
public class StlBatch {

    private static final Logger log = LoggerFactory.getLogger(StlBatch.class);

    private final StlService stlService;

    @Value("${commerce.stl.confirm-bizdays}")
    private int confirmBizDays;

    public StlBatch(StlService stlService) {
        this.stlService = stlService;
    }

    @Scheduled(cron = "${commerce.stl.batch-cron}")
    public void runConfirm() {
        String baseYmd = CmmUtil.today();
        log.info("[StlBatch] confirm start baseYmd={} bizDays={}", baseYmd, confirmBizDays);
        try {
            int cnt = stlService.confirmBatch(baseYmd, confirmBizDays);
            log.info("[StlBatch] confirm end cnt={}", cnt);
        } catch (Exception e) {
            log.error("[StlBatch] confirm fail baseYmd=" + baseYmd, e);
        }
    }

    // 2021.07 지급주기 변경(주 1회 수) - 지급예정일 도래분만 처리하므로 매일 실행 유지
    @Scheduled(cron = "0 0 9 * * *")
    public void runPay() {
        String payYmd = CmmUtil.today();
        log.info("[StlBatch] pay start payYmd={}", payYmd);
        try {
            int cnt = stlService.payBatch(payYmd);
            log.info("[StlBatch] pay end cnt={}", cnt);
        } catch (Exception e) {
            log.error("[StlBatch] pay fail payYmd=" + payYmd, e);
        }
    }
}
