package com.example.commerce.pnt;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.mbr.MbrService;
import com.example.commerce.ord.OrdService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 포인트 원장.
 * 적립건(EARN/ADJ+/재적립 USE_CNCL)의 REMAIN_AMT 가 사용 가능액이고, 사용은 유효기간 임박순으로 차감한다.
 * 잔액(TB_PNT_BAL)은 원장 변동 시마다 같이 맞춘다.
 */
@Service
public class PntService {

    private static final Logger log = LoggerFactory.getLogger(PntService.class);

    static final String TYPE_EARN = "EARN";
    static final String TYPE_USE = "USE";
    static final String TYPE_USE_CNCL = "USE_CNCL";
    static final String TYPE_EARN_CNCL = "EARN_CNCL";
    static final String TYPE_EXPIRE = "EXPIRE";
    static final String TYPE_ADJ = "ADJ";

    // 2021.07 등급별 적립률 정책 반영
    private static final double EARN_RATE_GEN = 0.01;
    private static final double EARN_RATE_SLV = 0.02;
    private static final double EARN_RATE_GLD = 0.03;
    private static final double EARN_RATE_VIP = 0.03;

    /** 사용취소 시 원 적립건이 이미 만료된 경우 재적립 유효일수 */
    private static final int REEARN_VALID_DAYS = 30;

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String SYSTEM_ID = "SYSTEM";

    private final PntMapper pntMapper;
    private final SeqService seqService;
    private final OrdService ordService;
    private final MbrService mbrService;

    @Value("${commerce.pnt.expire-months}")
    private int expireMonths;

    public PntService(PntMapper pntMapper, SeqService seqService, OrdService ordService, MbrService mbrService) {
        this.pntMapper = pntMapper;
        this.seqService = seqService;
        this.ordService = ordService;
        this.mbrService = mbrService;
    }

    public List<Map<String, Object>> selectLedgerList(Map<String, Object> search) {
        if (CmmUtil.isEmpty(CmmUtil.str(search, "MBR_ID"))) {
            throw new BizException("회원ID를 입력하세요.");
        }
        return pntMapper.selectLedgerList(search);
    }

    public List<Map<String, Object>> selectBalInfo(Map<String, Object> search) {
        String mbrId = CmmUtil.str(search, "MBR_ID");
        Map<String, Object> mbr = mbrService.getMbr(mbrId);
        Map<String, Object> row = new HashMap<>();
        row.put("MBR_ID", mbrId);
        row.put("MBR_NM", mbr.get("MBR_NM"));
        row.put("GRADE_CD", mbr.get("GRADE_CD"));
        row.put("BAL_AMT", getBal(mbrId));
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(row);
        return list;
    }

    public long getBal(String mbrId) {
        Map<String, Object> bal = pntMapper.selectBal(mbrId);
        return bal == null ? 0L : CmmUtil.lng(bal, "BAL_AMT");
    }

    /**
     * 주문 시 포인트 사용. 유효기간이 먼저 끝나는 적립건부터 차감한다.
     */
    @Transactional
    public void use(String mbrId, long amt, String ordNo) {
        if (amt <= 0) {
            return;
        }
        long bal = getBal(mbrId);
        if (bal < amt) {
            throw new BizException("포인트 잔액이 부족합니다. (잔액 " + bal + "P, 사용 " + amt + "P)");
        }
        // 2019.09 최소 사용 단위 10P (운영요청 #842)
        if (amt % 10 != 0) {
            throw new BizException("포인트는 10P 단위로 사용할 수 있습니다.");
        }
        deductFifo(mbrId, amt, TYPE_USE, ordNo, null, SYSTEM_ID);
        changeBal(mbrId, -amt);
        log.info("포인트 사용 mbrId={} ordNo={} amt={}", mbrId, ordNo, amt);
    }

    /**
     * 사용 포인트 환원 (주문취소/반품). 차감했던 원 적립건으로 되돌린다.
     * 원 적립건이 이미 만료됐으면 오늘부터 30일짜리로 다시 적립한다.
     */
    @Transactional
    public void cancelUse(String ordNo, long amt) {
        if (amt <= 0) {
            return;
        }
        List<Map<String, Object>> useList = pntMapper.selectCancelableUseList(ordNo);
        long cancelable = 0;
        for (Map<String, Object> use : useList) {
            cancelable += CmmUtil.lng(use, "REMAIN_AMT");
        }
        if (cancelable < amt) {
            throw new BizException("환원 가능한 사용 포인트를 초과했습니다. (환원가능 " + cancelable + "P, 요청 " + amt + "P)");
        }

        String today = CmmUtil.today();
        String mbrId = null;
        long left = amt;
        for (Map<String, Object> use : useList) {
            if (left <= 0) {
                break;
            }
            mbrId = CmmUtil.str(use, "MBR_ID");
            long useRemain = CmmUtil.lng(use, "REMAIN_AMT");
            long restoreAmt = Math.min(left, useRemain);

            Map<String, Object> org = pntMapper.selectLedger(CmmUtil.str(use, "ORG_LEDGER_NO"));
            Map<String, Object> ledger = newLedger(mbrId, TYPE_USE_CNCL, restoreAmt, ordNo, SYSTEM_ID);
            if (org != null && today.compareTo(CmmUtil.str(org, "EXP_DT")) <= 0) {
                updateRemain(CmmUtil.str(org, "LEDGER_NO"), restoreAmt);
                ledger.put("REMAIN_AMT", 0L);
                ledger.put("ORG_LEDGER_NO", CmmUtil.str(org, "LEDGER_NO"));
                ledger.put("EXP_DT", CmmUtil.str(org, "EXP_DT"));
                ledger.put("RMK", "사용취소 환원");
            } else {
                ledger.put("REMAIN_AMT", restoreAmt);
                ledger.put("ORG_LEDGER_NO", CmmUtil.str(use, "LEDGER_NO"));
                ledger.put("EXP_DT", addDays(today, REEARN_VALID_DAYS));
                ledger.put("RMK", "사용취소 재적립(원 적립건 만료)");
            }
            pntMapper.insertLedger(ledger);
            updateRemain(CmmUtil.str(use, "LEDGER_NO"), -restoreAmt);
            left -= restoreAmt;
        }
        changeBal(mbrId, amt);
        log.info("포인트 사용취소 ordNo={} amt={}", ordNo, amt);
    }

    /**
     * 구매확정 적립. 실결제금액(포인트 사용분 제외)에서 배송비와 취소·반품 상품금액을 뺀 금액에 등급별 적립률을 곱한다.
     */
    @Transactional
    public void earn(String ordNo) {
        if (pntMapper.selectEarnCntByOrd(ordNo) > 0) {
            log.info("이미 적립된 주문 ordNo={}", ordNo);
            return;
        }
        Map<String, Object> ord = ordService.getOrd(ordNo);
        String mbrId = CmmUtil.str(ord, "MBR_ID");

        long baseAmt = CmmUtil.lng(ord, "PAY_AMT") - CmmUtil.lng(ord, "DLV_FEE");
        for (Map<String, Object> item : ordService.getOrdItems(ordNo)) {
            String itemStat = CmmUtil.str(item, "ITEM_STAT");
            if ("C".equals(itemStat) || "X".equals(itemStat)) {
                baseAmt -= CmmUtil.lng(item, "ITEM_AMT");
            }
        }
        if (baseAmt <= 0) {
            log.info("적립 대상 금액 없음 ordNo={} baseAmt={}", ordNo, baseAmt);
            return;
        }

        String gradeCd = mbrService.getGradeCd(mbrId);
        double rate = getEarnRate(gradeCd);
        long earnAmt = CmmUtil.truncWon(baseAmt * rate);
        if (earnAmt <= 0) {
            return;
        }

        Map<String, Object> ledger = newLedger(mbrId, TYPE_EARN, earnAmt, ordNo, SYSTEM_ID);
        ledger.put("REMAIN_AMT", earnAmt);
        ledger.put("EXP_DT", addMonths(CmmUtil.today(), expireMonths));
        ledger.put("RMK", "구매확정 적립(" + gradeCd + ")");
        pntMapper.insertLedger(ledger);
        changeBal(mbrId, earnAmt);
        log.info("포인트 적립 ordNo={} mbrId={} grade={} base={} earn={}", ordNo, mbrId, gradeCd, baseAmt, earnAmt);
    }

    private double getEarnRate(String gradeCd) {
        switch (gradeCd == null ? "" : gradeCd) {
            case "SLV":
                return EARN_RATE_SLV;
            case "GLD":
                return EARN_RATE_GLD;
            case "VIP":
                return EARN_RATE_VIP;
            case "GEN":
            default:
                return EARN_RATE_GEN;
        }
    }

    /**
     * 적립 취소. amt 가 0 이하이면 해당 주문 적립분의 남은 금액 전부를 회수한다.
     * 이미 사용된 적립분은 회수하지 않는다.
     */
    @Transactional
    public void cancelEarn(String ordNo, long amt) {
        List<Map<String, Object>> earnList = pntMapper.selectEarnListByOrd(ordNo);
        if (earnList.isEmpty()) {
            log.info("적립 내역 없음 ordNo={}", ordNo);
            return;
        }
        long left = amt <= 0 ? Long.MAX_VALUE : amt;
        long cnclTotal = 0;
        String mbrId = null;
        for (Map<String, Object> earn : earnList) {
            if (left <= 0) {
                break;
            }
            mbrId = CmmUtil.str(earn, "MBR_ID");
            long cnclAmt = Math.min(left, CmmUtil.lng(earn, "REMAIN_AMT"));
            if (cnclAmt <= 0) {
                continue;
            }
            updateRemain(CmmUtil.str(earn, "LEDGER_NO"), -cnclAmt);
            Map<String, Object> ledger = newLedger(mbrId, TYPE_EARN_CNCL, -cnclAmt, ordNo, SYSTEM_ID);
            ledger.put("ORG_LEDGER_NO", CmmUtil.str(earn, "LEDGER_NO"));
            ledger.put("RMK", "적립취소");
            pntMapper.insertLedger(ledger);
            left -= cnclAmt;
            cnclTotal += cnclAmt;
        }
        if (amt > 0 && cnclTotal < amt) {
            log.warn("적립취소 일부 미회수(기사용) ordNo={} req={} cncl={}", ordNo, amt, cnclTotal);
        }
        if (cnclTotal > 0) {
            changeBal(mbrId, -cnclTotal);
        }
    }

    /**
     * 관리자 조정. ADJ_AMT 양수는 지급, 음수는 회수.
     * @return 조정 후 잔액
     */
    @Transactional
    public long adjust(Map<String, Object> adjust, String userId) {
        String mbrId = CmmUtil.str(adjust, "MBR_ID");
        long adjAmt = CmmUtil.lng(adjust, "ADJ_AMT");
        String rmk = CmmUtil.str(adjust, "RMK");
        if (CmmUtil.isEmpty(mbrId)) {
            throw new BizException("회원ID는 필수입니다.");
        }
        if (adjAmt == 0) {
            throw new BizException("조정 포인트를 입력하세요.");
        }
        if (CmmUtil.isEmpty(rmk)) {
            throw new BizException("조정 사유는 필수입니다.");
        }
        mbrService.getMbr(mbrId);

        if (adjAmt > 0) {
            Map<String, Object> ledger = newLedger(mbrId, TYPE_ADJ, adjAmt, null, userId);
            ledger.put("REMAIN_AMT", adjAmt);
            ledger.put("EXP_DT", addMonths(CmmUtil.today(), expireMonths));
            ledger.put("RMK", rmk);
            pntMapper.insertLedger(ledger);
        } else {
            long bal = getBal(mbrId);
            if (-adjAmt > bal) {
                throw new BizException("회수 포인트가 잔액을 초과합니다. (잔액 " + bal + "P)");
            }
            deductFifo(mbrId, -adjAmt, TYPE_ADJ, null, rmk, userId);
        }
        changeBal(mbrId, adjAmt);
        log.info("포인트 관리자조정 mbrId={} amt={} rmk={} by {}", mbrId, adjAmt, rmk, userId);
        return getBal(mbrId);
    }

    /** 유효기간 지난 적립건 소멸 */
    @Scheduled(cron = "${commerce.pnt.expire-cron}")
    @Transactional
    public void expireBatch() {
        String today = CmmUtil.today();
        List<Map<String, Object>> targetList = pntMapper.selectExpireTargetList(today);
        log.info("포인트 소멸 배치 시작 baseDt={} 대상={}건", today, targetList.size());
        long total = 0;
        for (Map<String, Object> target : targetList) {
            String mbrId = CmmUtil.str(target, "MBR_ID");
            long remain = CmmUtil.lng(target, "REMAIN_AMT");
            if (remain <= 0) {
                continue;
            }
            updateRemain(CmmUtil.str(target, "LEDGER_NO"), -remain);
            Map<String, Object> ledger = newLedger(mbrId, TYPE_EXPIRE, -remain, CmmUtil.str(target, "ORD_NO"), SYSTEM_ID);
            ledger.put("ORG_LEDGER_NO", CmmUtil.str(target, "LEDGER_NO"));
            ledger.put("EXP_DT", CmmUtil.str(target, "EXP_DT"));
            ledger.put("RMK", "유효기간 만료 소멸");
            pntMapper.insertLedger(ledger);
            changeBal(mbrId, -remain);
            total += remain;
        }
        log.info("포인트 소멸 배치 종료 소멸합계={}P", total);
    }

    /**
     * 유효기간 임박순으로 적립건 잔여를 차감하고, 차감한 적립건별로 원장 1건씩 남긴다.
     * 사용건의 REMAIN_AMT 는 이후 사용취소로 되돌릴 수 있는 금액이다.
     */
    private void deductFifo(String mbrId, long amt, String pntType, String ordNo, String rmk, String regId) {
        Map<String, Object> param = new HashMap<>();
        param.put("MBR_ID", mbrId);
        param.put("BASE_DT", CmmUtil.today());
        List<Map<String, Object>> earnList = pntMapper.selectUsableEarnList(param);

        long left = amt;
        for (Map<String, Object> earn : earnList) {
            if (left <= 0) {
                break;
            }
            long deduct = Math.min(left, CmmUtil.lng(earn, "REMAIN_AMT"));
            if (deduct <= 0) {
                continue;
            }
            updateRemain(CmmUtil.str(earn, "LEDGER_NO"), -deduct);
            Map<String, Object> ledger = newLedger(mbrId, pntType, -deduct, ordNo, regId);
            ledger.put("REMAIN_AMT", TYPE_USE.equals(pntType) ? deduct : 0L);
            ledger.put("ORG_LEDGER_NO", CmmUtil.str(earn, "LEDGER_NO"));
            ledger.put("EXP_DT", CmmUtil.str(earn, "EXP_DT"));
            ledger.put("RMK", rmk);
            pntMapper.insertLedger(ledger);
            left -= deduct;
        }
        if (left > 0) {
            // 잔액 테이블과 원장이 어긋난 경우
            log.error("포인트 원장 잔여 부족 mbrId={} req={} short={}", mbrId, amt, left);
            throw new BizException("사용 가능한 포인트가 부족합니다.");
        }
    }

    private Map<String, Object> newLedger(String mbrId, String pntType, long pntAmt, String ordNo, String regId) {
        Map<String, Object> ledger = new HashMap<>();
        ledger.put("LEDGER_NO", seqService.next("PNT"));
        ledger.put("MBR_ID", mbrId);
        ledger.put("PNT_TYPE", pntType);
        ledger.put("PNT_AMT", pntAmt);
        ledger.put("REMAIN_AMT", 0L);
        ledger.put("ORD_NO", ordNo);
        ledger.put("REG_ID", regId);
        return ledger;
    }

    private void updateRemain(String ledgerNo, long chgAmt) {
        Map<String, Object> param = new HashMap<>();
        param.put("LEDGER_NO", ledgerNo);
        param.put("CHG_AMT", chgAmt);
        pntMapper.updateRemainAmt(param);
    }

    private void changeBal(String mbrId, long chgAmt) {
        Map<String, Object> param = new HashMap<>();
        param.put("MBR_ID", mbrId);
        param.put("CHG_AMT", chgAmt);
        pntMapper.mergeBal(param);
    }

    private static String addDays(String ymd, int days) {
        return LocalDate.parse(ymd, YMD).plusDays(days).format(YMD);
    }

    private static String addMonths(String ymd, int months) {
        return LocalDate.parse(ymd, YMD).plusMonths(months).format(YMD);
    }
}
