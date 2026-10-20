package com.example.commerce.stl;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.ord.OrdService;
import com.example.commerce.prd.PrdService;
import java.math.BigDecimal;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 판매자 정산.
 * 배송완료 시 주문상품 단위로 정산대상(RDY)을 만들고, 정산 배치(SP_STL_CONFIRM)가 확정(CNF),
 * 지급 배치가 지급완료(PAID) 처리한다. 운영자는 지급 전까지 보류/해제/수동확정할 수 있다.
 */
@Service
public class StlService {

    private static final Logger log = LoggerFactory.getLogger(StlService.class);

    /** 지급 보류 대상 판매자 상태 (S 정지) */
    private static final List<String> SELLER_STOP_STAT = Arrays.asList("S");

    private static final int PAY_WEEKDAY = Calendar.WEDNESDAY;

    private final StlMapper stlMapper;
    private final SeqService seqService;
    private final OrdService ordService;
    private final PrdService prdService;

    public StlService(StlMapper stlMapper, SeqService seqService, @Lazy OrdService ordService, PrdService prdService) {
        this.stlMapper = stlMapper;
        this.seqService = seqService;
        this.ordService = ordService;
        this.prdService = prdService;
    }

    // ------------------------------------------------------------------ 조회

    public List<Map<String, Object>> selectStlList(Map<String, Object> search) {
        if (CmmUtil.intg(search, "PAGE_NO") <= 0) {
            search.put("PAGE_NO", 1);
        }
        if (CmmUtil.intg(search, "PAGE_SIZE") <= 0) {
            search.put("PAGE_SIZE", 100);
        }
        return stlMapper.selectStlList(search);
    }

    public int selectStlListCnt(Map<String, Object> search) {
        return stlMapper.selectStlListCnt(search);
    }

    public Map<String, Object> selectStlSum(Map<String, Object> search) {
        return stlMapper.selectStlSum(search);
    }

    public List<Map<String, Object>> selectStlPayList(Map<String, Object> search) {
        return stlMapper.selectStlPayList(search);
    }

    public List<Map<String, Object>> selectStlPayItemList(Map<String, Object> search) {
        if (CmmUtil.isEmpty(CmmUtil.str(search, "SELLER_ID")) || CmmUtil.isEmpty(CmmUtil.str(search, "PAY_SCHD_DT"))) {
            return new ArrayList<>();
        }
        return stlMapper.selectStlPayItemList(search);
    }

    // ------------------------------------------------------------------ 정산대상 생성

    /**
     * 정산대상 생성. 배송완료 시점에 호출되며 정산기준일(BASE_DT)은 호출 당일이다.
     * 판매금액은 주문상품금액(ITEM_AMT). 쿠폰 할인은 플랫폼 부담이라 판매자 정산에서 차감하지 않는다.
     */
    @Transactional
    public void createStlTarget(String ordNo) {
        List<Map<String, Object>> items = ordService.getOrdItems(ordNo);
        int cnt = 0;
        for (Map<String, Object> item : items) {
            if (!"N".equals(CmmUtil.str(item, "ITEM_STAT"))) {
                continue;
            }
            int itemSeq = CmmUtil.intg(item, "ITEM_SEQ");

            Map<String, Object> key = new HashMap<>();
            key.put("ORD_NO", ordNo);
            key.put("ITEM_SEQ", itemSeq);
            if (stlMapper.selectStlByItem(key) != null) {
                log.info("stl target exists ordNo={} itemSeq={}", ordNo, itemSeq);
                continue;
            }

            String prdCd = CmmUtil.str(item, "PRD_CD");
            long saleAmt = CmmUtil.lng(item, "ITEM_AMT");
            // long saleAmt = CmmUtil.lng(item, "ITEM_AMT") - CmmUtil.lng(item, "CPN_DC_SHARE_AMT");  2019.08 쿠폰 플랫폼 부담으로 변경
            BigDecimal commRate = prdService.getCommRate(prdCd);
            if (commRate == null) {
                commRate = BigDecimal.ZERO;
            }
            long commAmt = CmmUtil.truncWon(saleAmt * commRate.doubleValue() / 100);
            long stlAmt = saleAmt - commAmt;

            Map<String, Object> stl = new HashMap<>();
            stl.put("STL_NO", seqService.next("STL"));
            stl.put("SELLER_ID", CmmUtil.str(item, "SELLER_ID"));
            stl.put("ORD_NO", ordNo);
            stl.put("ITEM_SEQ", itemSeq);
            stl.put("PRD_CD", prdCd);
            stl.put("SALE_AMT", saleAmt);
            stl.put("COMM_RATE", commRate);
            stl.put("COMM_AMT", commAmt);
            stl.put("STL_AMT", stlAmt);
            stl.put("REG_ID", "SYSTEM");
            stlMapper.insertStl(stl);
            cnt++;
        }
        log.info("createStlTarget ordNo={} cnt={}", ordNo, cnt);
    }

    /**
     * 정산취소. 정산대기(RDY) 건만 취소된다.
     */
    @Transactional
    public void cancelStlTarget(String ordNo, int itemSeq) {
        Map<String, Object> key = new HashMap<>();
        key.put("ORD_NO", ordNo);
        key.put("ITEM_SEQ", itemSeq);
        Map<String, Object> stl = stlMapper.selectStlByItem(key);
        if (stl == null) {
            return;
        }
        if (!"RDY".equals(CmmUtil.str(stl, "STL_STAT"))) {
            throw new BizException("정산대기 상태만 취소할 수 있습니다.");
        }
        Map<String, Object> param = new HashMap<>();
        param.put("STL_NO", CmmUtil.str(stl, "STL_NO"));
        param.put("UPD_ID", "SYSTEM");
        stlMapper.updateStlCncl(param);
        log.info("cancelStlTarget ordNo={} itemSeq={} stlNo={}", ordNo, itemSeq, stl.get("STL_NO"));
    }

    // ------------------------------------------------------------------ 운영자 처리

    /**
     * 지급보류. 사유 필수, 정산대기/정산확정 건만 가능 (지급완료 건 불가).
     */
    @Transactional
    public int holdStl(List<Map<String, Object>> list, String holdRsn, String userId) {
        if (CmmUtil.isEmpty(holdRsn)) {
            throw new BizException("보류 사유를 입력하세요.");
        }
        if (holdRsn.length() > 200) {
            throw new BizException("보류 사유는 200자 이내로 입력하세요.");
        }
        Set<String> payKeys = new LinkedHashSet<>();
        int cnt = 0;
        for (Map<String, Object> row : list) {
            Map<String, Object> stl = getStlForUpdate(CmmUtil.str(row, "STL_NO"));
            String stat = CmmUtil.str(stl, "STL_STAT");
            if ("PAID".equals(stat)) {
                throw new BizException("지급완료된 정산은 보류할 수 없습니다. (" + stl.get("STL_NO") + ")");
            }
            if (!"RDY".equals(stat) && !"CNF".equals(stat)) {
                throw new BizException("정산대기/정산확정 상태만 보류할 수 있습니다. (" + stl.get("STL_NO") + ")");
            }
            Map<String, Object> param = new HashMap<>();
            param.put("STL_NO", stl.get("STL_NO"));
            param.put("HOLD_RSN", holdRsn);
            param.put("UPD_ID", userId);
            cnt += stlMapper.updateStlHold(param);

            if ("CNF".equals(stat)) {
                payKeys.add(CmmUtil.str(stl, "SELLER_ID") + "|" + CmmUtil.str(stl, "PAY_SCHD_DT"));
            }
        }
        refreshStlPay(payKeys);
        log.info("holdStl cnt={} userId={}", cnt, userId);
        return cnt;
    }

    /**
     * 보류해제. 확정 전 보류 건은 정산대기로, 확정 후 보류 건은 정산확정으로 돌아간다.
     * 확정 건의 지급예정일이 지났으면 다음 지급일로 다시 잡는다.
     */
    @Transactional
    public int releaseHold(List<Map<String, Object>> list, String userId) {
        Set<String> payKeys = new LinkedHashSet<>();
        String nextPayYmd = calcPaySchdYmd(CmmUtil.today());
        int cnt = 0;
        for (Map<String, Object> row : list) {
            Map<String, Object> stl = getStlForUpdate(CmmUtil.str(row, "STL_NO"));
            if (!"HOLD".equals(CmmUtil.str(stl, "STL_STAT"))) {
                throw new BizException("지급보류 상태만 해제할 수 있습니다. (" + stl.get("STL_NO") + ")");
            }
            String paySchd = CmmUtil.str(stl, "PAY_SCHD_DT");
            boolean confirmed = !CmmUtil.isEmpty(CmmUtil.str(stl, "CNFM_DT"));
            if (confirmed && (CmmUtil.isEmpty(paySchd) || paySchd.compareTo(CmmUtil.today()) <= 0)) {
                paySchd = nextPayYmd;
            }
            Map<String, Object> param = new HashMap<>();
            param.put("STL_NO", stl.get("STL_NO"));
            param.put("PAY_SCHD_DT", paySchd);
            param.put("UPD_ID", userId);
            cnt += stlMapper.updateStlRelease(param);

            if (confirmed) {
                payKeys.add(CmmUtil.str(stl, "SELLER_ID") + "|" + CmmUtil.str(stl, "PAY_SCHD_DT"));
                payKeys.add(CmmUtil.str(stl, "SELLER_ID") + "|" + paySchd);
            }
        }
        refreshStlPay(payKeys);
        log.info("releaseHold cnt={} userId={}", cnt, userId);
        return cnt;
    }

    /**
     * 관리자 수동 확정. 정산대기(RDY) 건만, 사유 필수.
     * 2021.03 운영요청 #1530 - 판매자 요청 조기정산 처리용
     */
    @Transactional
    public int confirmStl(List<Map<String, Object>> list, String cnfmRsn, String userId) {
        if (CmmUtil.isEmpty(cnfmRsn)) {
            throw new BizException("수동 확정 사유를 입력하세요.");
        }
        String paySchd = calcPaySchdYmd(CmmUtil.today());
        Set<String> payKeys = new LinkedHashSet<>();
        int cnt = 0;
        for (Map<String, Object> row : list) {
            Map<String, Object> stl = getStlForUpdate(CmmUtil.str(row, "STL_NO"));
            if (!"RDY".equals(CmmUtil.str(stl, "STL_STAT"))) {
                throw new BizException("정산대기 상태만 수동 확정할 수 있습니다. (" + stl.get("STL_NO") + ")");
            }
            Map<String, Object> param = new HashMap<>();
            param.put("STL_NO", stl.get("STL_NO"));
            param.put("CNFM_RSN", cnfmRsn);
            param.put("PAY_SCHD_DT", paySchd);
            param.put("UPD_ID", userId);
            cnt += stlMapper.updateStlManualConfirm(param);
            payKeys.add(CmmUtil.str(stl, "SELLER_ID") + "|" + paySchd);
        }
        refreshStlPay(payKeys);
        log.info("confirmStl manual cnt={} userId={} rsn={}", cnt, userId, cnfmRsn);
        return cnt;
    }

    // ------------------------------------------------------------------ 배치

    /**
     * 정산 확정 배치. 영업일 계산과 확정/지급집계는 프로시저(SP_STL_CONFIRM)에서 처리.
     */
    @Transactional
    public int confirmBatch(String baseYmd, int bizDays) {
        Map<String, Object> param = new HashMap<>();
        param.put("BASE_YMD", baseYmd);
        param.put("BIZ_DAYS", bizDays);
        stlMapper.callStlConfirm(param);
        int cnt = CmmUtil.intg(param, "CNT");
        log.info("SP_STL_CONFIRM baseYmd={} bizDays={} cnt={}", baseYmd, bizDays, cnt);
        return cnt;
    }

    /**
     * 지급 배치. 지급예정일이 도래한 확정 건을 지급완료 처리한다.
     * 정지 판매자의 확정 건은 지급하지 않고 보류로 돌린다.
     */
    @Transactional
    public int payBatch(String payYmd) {
        Map<String, Object> param = new HashMap<>();
        param.put("PAY_YMD", payYmd);
        param.put("STOP_STAT_LIST", SELLER_STOP_STAT);

        int holdCnt = stlMapper.updateHoldSuspendedSeller(param);
        if (holdCnt > 0) {
            log.info("payBatch seller stop hold cnt={}", holdCnt);
            List<Map<String, Object>> targets = stlMapper.selectPayTargetSeller(param);
            for (Map<String, Object> t : targets) {
                stlMapper.mergeStlPay(t);
            }
        }

        int stlCnt = stlMapper.updateStlPaid(param);
        int payCnt = stlMapper.updateStlPayPaid(param);
        log.info("payBatch payYmd={} stlCnt={} payCnt={}", payYmd, stlCnt, payCnt);
        return stlCnt;
    }

    // ------------------------------------------------------------------ 내부

    private Map<String, Object> getStlForUpdate(String stlNo) {
        if (CmmUtil.isEmpty(stlNo)) {
            throw new BizException("정산번호가 없습니다.");
        }
        Map<String, Object> stl = stlMapper.selectStl(stlNo);
        if (stl == null) {
            throw new BizException("정산 정보가 없습니다. (" + stlNo + ")");
        }
        return stl;
    }

    private void refreshStlPay(Set<String> payKeys) {
        for (String k : payKeys) {
            String[] arr = k.split("\\|", -1);
            if (arr.length < 2 || CmmUtil.isEmpty(arr[1])) {
                continue;
            }
            Map<String, Object> param = new HashMap<>();
            param.put("SELLER_ID", arr[0]);
            param.put("PAY_SCHD_DT", arr[1]);
            stlMapper.mergeStlPay(param);
        }
    }

    /** 기준일 이후 첫 수요일 (휴일이면 다음 영업일). SP_STL_CONFIRM과 같은 기준. */
    String calcPaySchdYmd(String baseYmd) {
        SimpleDateFormat fmt = new SimpleDateFormat("yyyyMMdd");
        Calendar cal = Calendar.getInstance();
        try {
            cal.setTime(fmt.parse(baseYmd));
        } catch (Exception e) {
            throw new BizException("일자 형식이 올바르지 않습니다. (" + baseYmd + ")");
        }
        cal.add(Calendar.DATE, 1);
        while (cal.get(Calendar.DAY_OF_WEEK) != PAY_WEEKDAY) {
            cal.add(Calendar.DATE, 1);
        }
        while (true) {
            int dow = cal.get(Calendar.DAY_OF_WEEK);
            String ymd = fmt.format(cal.getTime());
            if (dow != Calendar.SATURDAY && dow != Calendar.SUNDAY && stlMapper.selectHolidayCnt(ymd) == 0) {
                return ymd;
            }
            cal.add(Calendar.DATE, 1);
        }
    }
}
