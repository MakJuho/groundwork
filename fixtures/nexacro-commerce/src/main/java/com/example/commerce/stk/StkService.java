package com.example.commerce.stk;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고.
 *  가용재고 = 실재고(STK_QTY) - 예약재고(RSV_QTY)
 *  주문(결제) 시 reserve → 출고 시 confirmOut / 취소 시 release, 반품 입고 시 restock.
 *  모든 변경은 TB_STK_HIST 에 남긴다.
 */
@Service
public class StkService {

    private static final Logger log = LoggerFactory.getLogger(StkService.class);

    public static final String CHG_RSV = "RSV";
    public static final String CHG_RLS = "RLS";
    public static final String CHG_OUT = "OUT";
    public static final String CHG_RTN = "RTN";
    public static final String CHG_ADJ = "ADJ";

    private static final String SYS_ID = "SYSTEM";

    private final StkMapper stkMapper;

    public StkService(StkMapper stkMapper) {
        this.stkMapper = stkMapper;
    }

    public List<Map<String, Object>> selectStkList(Map<String, Object> search) {
        return stkMapper.selectStkList(search);
    }

    /** 재고 예약 (주문). 가용재고 부족 시 BizException */
    @Transactional
    public void reserve(String prdCd, int qty, String ordNo) {
        if (qty <= 0) {
            throw new BizException("예약 수량이 올바르지 않습니다: " + qty);
        }
        Map<String, Object> stk = lockStk(prdCd);
        int stkQty = CmmUtil.intg(stk, "STK_QTY");
        int rsvQty = CmmUtil.intg(stk, "RSV_QTY");
        int availQty = stkQty - rsvQty;
        if (availQty < qty) {
            log.info("[STK] 가용재고 부족 {} 가용 {} 요청 {} 주문 {}", prdCd, availQty, qty, ordNo);
            throw new BizException("STK001", "재고가 부족합니다. (상품 " + prdCd + ", 가용 " + availQty + "개)");
        }
        apply(stk, CHG_RSV, qty, stkQty, rsvQty + qty, ordNo, null, SYS_ID);
    }

    /** 예약 해제 (주문취소/결제실패) */
    @Transactional
    public void release(String prdCd, int qty, String ordNo) {
        if (qty <= 0) {
            return;
        }
        Map<String, Object> stk = lockStk(prdCd);
        int stkQty = CmmUtil.intg(stk, "STK_QTY");
        int rsvQty = CmmUtil.intg(stk, "RSV_QTY");
        int afRsv = rsvQty - qty;
        if (afRsv < 0) {
            // 2021.04 운영요청 #1630 예약수량 마이너스 방지 (이관 데이터 예약 누락분)
            log.warn("[STK] 예약해제 수량 초과 {} 예약 {} 해제 {} 주문 {}", prdCd, rsvQty, qty, ordNo);
            afRsv = 0;
        }
        apply(stk, CHG_RLS, qty, stkQty, afRsv, ordNo, null, SYS_ID);
    }

    /** 출고 확정: 실재고와 예약재고를 함께 차감 */
    @Transactional
    public void confirmOut(String prdCd, int qty, String ordNo) {
        Map<String, Object> stk = lockStk(prdCd);
        int stkQty = CmmUtil.intg(stk, "STK_QTY");
        int rsvQty = CmmUtil.intg(stk, "RSV_QTY");
        if (stkQty < qty) {
            throw new BizException("STK002", "출고할 재고가 부족합니다. (상품 " + prdCd + ", 재고 " + stkQty + "개)");
        }
        int afRsv = Math.max(rsvQty - qty, 0);
        apply(stk, CHG_OUT, qty, stkQty - qty, afRsv, ordNo, null, SYS_ID);
    }

    /** 반품 입고 */
    @Transactional
    public void restock(String prdCd, int qty, String ordNo) {
        if (qty <= 0) {
            return;
        }
        Map<String, Object> stk = lockStk(prdCd);
        int stkQty = CmmUtil.intg(stk, "STK_QTY");
        int rsvQty = CmmUtil.intg(stk, "RSV_QTY");
        apply(stk, CHG_RTN, qty, stkQty + qty, rsvQty, ordNo, "반품입고", SYS_ID);
    }

    /**
     * 관리자 재고 조정 (재고관리 화면).
     * ADJ_QTY: 증감 수량(+/-), ADJ_RSN: 사유(필수), SAFE_QTY: 안전재고 변경 시
     */
    @Transactional
    public int adjustList(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String prdCd = CmmUtil.str(row, "PRD_CD");
            int adjQty = CmmUtil.intg(row, "ADJ_QTY");
            String rsn = CmmUtil.str(row, "ADJ_RSN");

            if (CmmUtil.isEmpty(prdCd)) {
                throw new BizException("상품코드가 없습니다.");
            }
            if (CmmUtil.isEmpty(rsn)) {
                throw new BizException("재고 조정 사유를 입력하세요. (상품 " + prdCd + ")");
            }

            Map<String, Object> stk = lockStk(prdCd);
            int stkQty = CmmUtil.intg(stk, "STK_QTY");
            int rsvQty = CmmUtil.intg(stk, "RSV_QTY");

            if (!CmmUtil.isEmpty(CmmUtil.str(row, "SAFE_QTY"))) {
                int safeQty = CmmUtil.intg(row, "SAFE_QTY");
                if (safeQty < 0) {
                    throw new BizException("안전재고는 0 이상이어야 합니다.");
                }
                if (safeQty != CmmUtil.intg(stk, "SAFE_QTY")) {
                    Map<String, Object> p = new HashMap<>();
                    p.put("PRD_CD", prdCd);
                    p.put("SAFE_QTY", safeQty);
                    p.put("USER_ID", userId);
                    stkMapper.updateSafeQty(p);
                    stk.put("SAFE_QTY", safeQty);
                }
            }
            if (adjQty == 0) {
                cnt++;
                continue;
            }

            int afStk = stkQty + adjQty;
            if (afStk < rsvQty) {
                throw new BizException("조정 후 재고(" + afStk + ")가 주문 예약수량(" + rsvQty
                        + ")보다 적을 수 없습니다. (상품 " + prdCd + ")");
            }
            // if (afStk < 0) {
            //     throw new BizException("재고는 0 미만으로 조정할 수 없습니다.");
            // }
            apply(stk, CHG_ADJ, adjQty, afStk, rsvQty, null, rsn, userId);
            log.info("[STK] 관리자 조정 {} {} -> {} ({}) by {}", prdCd, stkQty, afStk, rsn, userId);
            cnt++;
        }
        return cnt;
    }

    private Map<String, Object> lockStk(String prdCd) {
        Map<String, Object> stk = stkMapper.selectStkForUpdate(prdCd);
        if (stk == null) {
            throw new BizException("STK000", "재고 정보가 없습니다: " + prdCd);
        }
        return stk;
    }

    /** 재고 반영 + 이력 + 안전재고 경고 */
    private void apply(Map<String, Object> stk, String chgType, int chgQty, int afStk, int afRsv,
                       String ordNo, String rsn, String userId) {
        String prdCd = CmmUtil.str(stk, "PRD_CD");

        Map<String, Object> upd = new HashMap<>();
        upd.put("PRD_CD", prdCd);
        upd.put("STK_QTY", afStk);
        upd.put("RSV_QTY", afRsv);
        upd.put("CHG_TYPE", chgType);
        upd.put("USER_ID", userId);
        stkMapper.updateStk(upd);

        Map<String, Object> hist = new HashMap<>();
        hist.put("PRD_CD", prdCd);
        hist.put("CHG_TYPE", chgType);
        hist.put("CHG_QTY", chgQty);
        hist.put("BF_STK_QTY", stk.get("STK_QTY"));
        hist.put("AF_STK_QTY", afStk);
        hist.put("BF_RSV_QTY", stk.get("RSV_QTY"));
        hist.put("AF_RSV_QTY", afRsv);
        hist.put("ORD_NO", ordNo);
        hist.put("CHG_RSN", rsn);
        hist.put("REG_ID", userId);
        stkMapper.insertStkHist(hist);

        int safeQty = CmmUtil.intg(stk, "SAFE_QTY");
        if (safeQty > 0 && afStk - afRsv <= safeQty) {
            // 안전재고 이하 - 운영 모니터링 로그 수집 대상 (알림톡 연동은 2022.08 중단)
            log.warn("[STK] 안전재고 이하 {} 가용 {} 안전재고 {}", prdCd, afStk - afRsv, safeQty);
        }
    }
}
