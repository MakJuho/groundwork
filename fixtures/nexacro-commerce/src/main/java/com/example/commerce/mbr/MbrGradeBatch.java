package com.example.commerce.mbr;

import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회원 등급 산정 / 휴면 전환 배치. 매월 1일 04시 (commerce.mbr.grade-cron)
 *  1) 마지막 로그인 1년 경과 정상회원 → 휴면(D)
 *  2) 직전 6개월 구매확정(ORD_STAT 60) 금액으로 등급 재산정 (MBR_GRADE CD_VAL1 기준)
 *     - 승급은 해당 등급으로 바로, 강등은 한 단계씩
 *     - 휴면 회원은 산정 대상 제외
 */
@Component
public class MbrGradeBatch {

    private static final Logger log = LoggerFactory.getLogger(MbrGradeBatch.class);

    private static final String BATCH_ID = "BATCH";

    private final MbrMapper mbrMapper;
    private final CmmCodeService cmmCodeService;

    public MbrGradeBatch(MbrMapper mbrMapper, CmmCodeService cmmCodeService) {
        this.mbrMapper = mbrMapper;
        this.cmmCodeService = cmmCodeService;
    }

    @Scheduled(cron = "${commerce.mbr.grade-cron}")
    public void run() {
        log.info("[MBR-BATCH] 회원 등급 산정 배치 시작");
        long st = System.currentTimeMillis();
        int drmntCnt = 0;
        int gradeCnt = 0;
        try {
            drmntCnt = convertDormant();
            gradeCnt = recalcGrade();
        } catch (Exception e) {
            log.error("[MBR-BATCH] 배치 오류", e);
        }
        log.info("[MBR-BATCH] 종료 휴면전환 {}건, 등급변경 {}건, {}ms", drmntCnt, gradeCnt, System.currentTimeMillis() - st);
    }

    /** 휴면 전환: 마지막 로그인 1년 경과 (로그인 이력 없으면 가입일 기준) */
    @Transactional
    public int convertDormant() {
        Map<String, Object> param = new HashMap<>();
        param.put("DRMNT_MONTHS", 12);  // 개인정보 유효기간제 1년
        List<Map<String, Object>> targets = mbrMapper.selectDormantTargetList(param);
        int cnt = 0;
        for (Map<String, Object> mbr : targets) {
            Map<String, Object> upd = new HashMap<>();
            upd.put("MBR_ID", mbr.get("MBR_ID"));
            upd.put("USER_ID", BATCH_ID);
            cnt += mbrMapper.updateDormant(upd);
        }
        log.info("[MBR-BATCH] 휴면 전환 대상 {}건", targets.size());
        return cnt;
    }

    /** 등급 재산정 */
    @Transactional
    public int recalcGrade() {
        // 등급 기준표 (SORT_ORD 순: GEN, SLV, GLD, VIP)
        Map<String, Object> codeParam = new HashMap<>();
        codeParam.put("GRP_CD", "MBR_GRADE");
        codeParam.put("USE_YN", "Y");
        List<Map<String, Object>> gradeList = cmmCodeService.getCodeList(codeParam);
        List<String> gradeOrd = new ArrayList<>();
        List<Long> gradeBase = new ArrayList<>();
        for (Map<String, Object> g : gradeList) {
            gradeOrd.add(CmmUtil.str(g, "CD"));
            gradeBase.add(CmmUtil.lng(g, "CD_VAL1"));
        }
        if (gradeOrd.isEmpty()) {
            log.warn("[MBR-BATCH] MBR_GRADE 코드 없음. 등급 산정 생략");
            return 0;
        }

        List<Map<String, Object>> targets = mbrMapper.selectGradeTargetList(new HashMap<>());
        int cnt = 0;
        for (Map<String, Object> mbr : targets) {
            String mbrId = CmmUtil.str(mbr, "MBR_ID");
            String curGrade = CmmUtil.str(mbr, "GRADE_CD");
            long amt = CmmUtil.lng(mbr, "CNFM_AMT_6M");

            int curIdx = gradeOrd.indexOf(curGrade);
            if (curIdx < 0) {
                curIdx = 0;
            }
            // 금액 기준 산정 등급
            int calcIdx = 0;
            for (int i = 0; i < gradeBase.size(); i++) {
                if (amt >= gradeBase.get(i)) {
                    calcIdx = i;
                }
            }

            int newIdx;
            if (calcIdx > curIdx) {
                newIdx = calcIdx;
            } else if (calcIdx < curIdx) {
                // 2020.06 정책 - 강등은 한 단계씩만 (고객 불만 대응)
                newIdx = curIdx - 1;
            } else {
                continue;
            }
            // newIdx = calcIdx;   2020.06 이전 로직

            String newGrade = gradeOrd.get(newIdx);
            Map<String, Object> upd = new HashMap<>();
            upd.put("MBR_ID", mbrId);
            upd.put("GRADE_CD", newGrade);
            upd.put("USER_ID", BATCH_ID);
            mbrMapper.updateGrade(upd);

            Map<String, Object> hist = new HashMap<>();
            hist.put("MBR_ID", mbrId);
            hist.put("BF_GRADE_CD", curGrade);
            hist.put("AF_GRADE_CD", newGrade);
            hist.put("CHG_TYPE", "B");
            hist.put("CNFM_AMT_6M", amt);
            hist.put("CHG_RSN", newIdx > curIdx ? "정기 등급산정(승급)" : "정기 등급산정(강등)");
            hist.put("CHG_ID", BATCH_ID);
            mbrMapper.insertGradeHist(hist);
            cnt++;
        }
        return cnt;
    }
}
