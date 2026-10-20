package com.example.commerce.ord;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cpn.CpnService;
import com.example.commerce.dlv.DlvService;
import com.example.commerce.mbr.MbrService;
import com.example.commerce.pay.PayService;
import com.example.commerce.pnt.PntService;
import com.example.commerce.stk.StkService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 주문 서비스.
 * <pre>
 * 2019.04  최초 작성
 * 2019.11  상품준비 시 배송건 생성 연동
 * 2020.03  쿠폰/포인트 복원 연동 (주문취소)
 * 2020.11  운영요청 #1182 부분취소 추가 (출고 전 상품단위 취소)
 * 2021.07  포인트 사용한도 정책변경
 * 2022.01  자동 구매확정 배치 추가
 * </pre>
 */
@Service
public class OrdService {

    private static final Logger log = LoggerFactory.getLogger(OrdService.class);

    /** 주문상태 ORD_STAT */
    public static final String ORD_STAT_RECEIVED = "10";   // 주문접수(입금대기 포함)
    public static final String ORD_STAT_PAID = "20";       // 결제완료
    public static final String ORD_STAT_PREPARE = "30";    // 상품준비
    public static final String ORD_STAT_SHIPPED = "40";    // 출고
    public static final String ORD_STAT_DELIVERED = "50";  // 배송완료
    public static final String ORD_STAT_CONFIRMED = "60";  // 구매확정
    public static final String ORD_STAT_PART_CNCL = "80";  // 부분취소
    public static final String ORD_STAT_CANCELED = "90";   // 주문취소

    /** 주문상품상태 ITEM_STAT */
    public static final String ITEM_STAT_NORMAL = "N";
    public static final String ITEM_STAT_CANCEL = "C";
    public static final String ITEM_STAT_RTN_REQ = "R";
    public static final String ITEM_STAT_RTN_CMPL = "X";

    /** 결제상태 (TB_PAY.PAY_STAT) */
    private static final String PAY_STAT_WAIT = "W";
    private static final String PAY_STAT_APPROVED = "A";
    private static final String PAY_STAT_PART_CNCL = "P";

    /** 배송완료 후 자동 구매확정까지 일수 */
    private static final int AUTO_CNFM_DAYS = 7;
    /** 목록 조회 최대 기간(일) */
    private static final int MAX_SEARCH_DAYS = 92;
    /** 포인트 최소 사용 / 사용 단위 / 결제금액 대비 최대 사용률(%) */
    private static final long PNT_MIN_USE = 1000L;
    private static final long PNT_USE_UNIT = 10L;
    private static final int PNT_MAX_USE_RATE = 50;

    private static final String BATCH_ID = "BATCH";
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final OrdMapper ordMapper;
    private final CmmCodeService cmmCodeService;
    private final PayService payService;
    private final CpnService cpnService;
    private final PntService pntService;
    private final StkService stkService;
    private final DlvService dlvService;
    private final MbrService mbrService;
    private final TransactionTemplate txTemplate;

    public OrdService(OrdMapper ordMapper, CmmCodeService cmmCodeService, PayService payService,
                      CpnService cpnService, PntService pntService, StkService stkService,
                      DlvService dlvService, MbrService mbrService, PlatformTransactionManager txManager) {
        this.ordMapper = ordMapper;
        this.cmmCodeService = cmmCodeService;
        this.payService = payService;
        this.cpnService = cpnService;
        this.pntService = pntService;
        this.stkService = stkService;
        this.dlvService = dlvService;
        this.mbrService = mbrService;
        this.txTemplate = new TransactionTemplate(txManager);
    }

    // =====================================================================
    // 조회
    // =====================================================================

    /**
     * 주문 목록. 주문상태는 화면에서 콤마로 여러 개를 넘긴다 (ORD_STAT_LIST=10,20,30).
     */
    public List<Map<String, Object>> list(Map<String, Object> search) {
        String ordNo = CmmUtil.str(search, "ORD_NO");
        String fromDt = CmmUtil.str(search, "FROM_DT").replaceAll("-", "");
        String toDt = CmmUtil.str(search, "TO_DT").replaceAll("-", "");
        search.put("FROM_DT", fromDt);
        search.put("TO_DT", toDt);

        // 주문번호 단건 조회가 아니면 기간 필수, 최대 3개월
        if (CmmUtil.isEmpty(ordNo)) {
            if (CmmUtil.isEmpty(fromDt) || CmmUtil.isEmpty(toDt)) {
                throw new BizException("조회기간을 입력하세요.");
            }
            LocalDate from = LocalDate.parse(fromDt, YMD);
            LocalDate to = LocalDate.parse(toDt, YMD);
            if (from.isAfter(to)) {
                throw new BizException("시작일이 종료일보다 늦습니다.");
            }
            if (ChronoUnit.DAYS.between(from, to) > MAX_SEARCH_DAYS) {
                throw new BizException("조회기간은 3개월을 넘을 수 없습니다.");
            }
        } else {
            search.remove("FROM_DT");
            search.remove("TO_DT");
        }

        String statCsv = CmmUtil.str(search, "ORD_STAT_LIST");
        if (!CmmUtil.isEmpty(statCsv)) {
            List<String> stats = new ArrayList<>();
            for (String s : statCsv.split(",")) {
                if (!CmmUtil.isEmpty(s)) {
                    stats.add(s.trim());
                }
            }
            search.put("ORD_STAT_LIST", stats);
        } else {
            search.remove("ORD_STAT_LIST");
        }

        if (CmmUtil.intg(search, "PAGE_NO") <= 0) {
            search.put("PAGE_NO", 1);
        }
        if (CmmUtil.intg(search, "PAGE_SIZE") <= 0 || CmmUtil.intg(search, "PAGE_SIZE") > 500) {
            search.put("PAGE_SIZE", 100);
        }
        return ordMapper.selectOrdList(search);
    }

    public int listCnt(Map<String, Object> search) {
        return ordMapper.selectOrdListCnt(search);
    }

    /**
     * 주문 상세. 주문 + 주문상품 + 결제/배송 요약 + 상태이력.
     * 금액 검증 결과(AMT_CHK_YN)를 함께 내려 화면에서 표시한다.
     */
    public Map<String, Object> detail(String ordNo) {
        Map<String, Object> ord = getOrd(ordNo);
        Map<String, Object> result = new HashMap<>();

        try {
            Map<String, Object> mbr = mbrService.getMbr(CmmUtil.str(ord, "MBR_ID"));
            ord.put("GRADE_CD", mbr.get("GRADE_CD"));
            ord.put("MBR_STAT", mbr.get("MBR_STAT"));
        } catch (BizException e) {
            // 탈퇴 후 삭제된 회원
            ord.put("MBR_STAT", "D");
        }

        Map<String, Object> calc = calcOrdAmt(ord);
        ord.put("CALC_DLV_FEE", calc.get("DLV_FEE"));
        ord.put("CALC_PAY_AMT", calc.get("PAY_AMT"));
        ord.put("AMT_CHK_YN", calc.get("CHK_YN"));
        ord.put("AMT_CHK_MSG", calc.get("CHK_MSG"));

        Map<String, Object> cpn = cpnService.getUsedCpn(ordNo);
        if (cpn != null) {
            ord.put("CPN_ISSUE_NO", cpn.get("ISSUE_NO"));
            ord.put("CPN_ID", cpn.get("CPN_ID"));
        }

        result.put("ORD", ord);
        result.put("ITEM", getOrdItems(ordNo));
        result.put("PAY", payService.getPay(ordNo));

        String ordStat = CmmUtil.str(ord, "ORD_STAT");
        if (ORD_STAT_PREPARE.compareTo(ordStat) <= 0 && !ORD_STAT_CANCELED.equals(ordStat)) {
            result.put("DLV", dlvService.getDlv(ordNo));
        }
        result.put("HIST", ordMapper.selectStatHistList(ordNo));
        return result;
    }

    public Map<String, Object> getOrd(String ordNo) {
        Map<String, Object> ord = ordMapper.selectOrd(ordNo);
        if (ord == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
        }
        return ord;
    }

    public List<Map<String, Object>> getOrdItems(String ordNo) {
        return ordMapper.selectOrdItemList(ordNo);
    }

    // =====================================================================
    // 주문 금액
    // =====================================================================

    /**
     * 주문 금액 계산/검증.
     * <pre>
     * PAY_AMT = ORD_AMT - CPN_DC_AMT - PNT_USE_AMT + DLV_FEE
     * DLV_FEE = ORD_AMT >= 무료배송 최소금액(DLV_FEE.FREE_MIN) 이면 0, 아니면 기본배송비(DLV_FEE.BASE)
     *           (도서산간/제주 추가배송비는 배송 모듈 TB_DLV.ADD_FEE 로 별도)
     * 포인트   = 1,000P 이상, 10P 단위, (ORD_AMT - CPN_DC_AMT + DLV_FEE) 의 50% 까지
     * </pre>
     * @return DLV_FEE, PAY_AMT, CHK_YN(Y 정상), CHK_MSG
     */
    public Map<String, Object> calcOrdAmt(Map<String, Object> ord) {
        long ordAmt = CmmUtil.lng(ord, "ORD_AMT");
        long cpnDcAmt = CmmUtil.lng(ord, "CPN_DC_AMT");
        long pntUseAmt = CmmUtil.lng(ord, "PNT_USE_AMT");

        long freeMin = codeLong("DLV_FEE", "FREE_MIN", 50000L);
        long baseFee = codeLong("DLV_FEE", "BASE", 3000L);
        long dlvFee = ordAmt >= freeMin ? 0L : baseFee;

        long payAmt = ordAmt - cpnDcAmt - pntUseAmt + dlvFee;

        Map<String, Object> out = new HashMap<>();
        out.put("DLV_FEE", dlvFee);
        out.put("PAY_AMT", payAmt);
        out.put("CHK_YN", "Y");
        out.put("CHK_MSG", "");

        String msg = checkPntUse(ordAmt, cpnDcAmt, dlvFee, pntUseAmt);
        if (msg == null && cpnDcAmt > ordAmt) {
            msg = "쿠폰할인액이 주문금액보다 큽니다.";
        }
        if (msg == null && dlvFee != CmmUtil.lng(ord, "DLV_FEE")) {
            msg = "배송비가 기준과 다릅니다. (기준 " + dlvFee + ", 주문 " + CmmUtil.lng(ord, "DLV_FEE") + ")";
        }
        if (msg == null && payAmt != CmmUtil.lng(ord, "PAY_AMT")) {
            msg = "결제금액이 계산값과 다릅니다. (계산 " + payAmt + ", 주문 " + CmmUtil.lng(ord, "PAY_AMT") + ")";
        }
        if (msg != null) {
            out.put("CHK_YN", "N");
            out.put("CHK_MSG", msg);
        }
        return out;
    }

    /** 금액 검증. 맞지 않으면 BizException */
    public void validateOrdAmt(Map<String, Object> ord) {
        Map<String, Object> calc = calcOrdAmt(ord);
        if (!"Y".equals(calc.get("CHK_YN"))) {
            throw new BizException("[" + CmmUtil.str(ord, "ORD_NO") + "] " + calc.get("CHK_MSG"));
        }
    }

    /** 포인트 사용 규칙. 위반 시 메시지, 정상이면 null */
    private String checkPntUse(long ordAmt, long cpnDcAmt, long dlvFee, long pntUseAmt) {
        if (pntUseAmt <= 0) {
            return null;
        }
        if (pntUseAmt < PNT_MIN_USE) {
            return "포인트는 1,000P 이상부터 사용할 수 있습니다.";
        }
        if (pntUseAmt % PNT_USE_UNIT != 0) {
            return "포인트는 10P 단위로 사용할 수 있습니다.";
        }
        long basis = ordAmt - cpnDcAmt + dlvFee;
        // 2019.04 최초: 결제금액의 30%까지
        // long maxPnt = CmmUtil.truncWon(basis * 0.3);
        // 2021.07 정책변경 : 포인트 사용한도 결제금액의 50%로 상향 (마케팅 요청)
        long maxPnt = CmmUtil.truncWon(basis * PNT_MAX_USE_RATE / 100.0);
        if (pntUseAmt > maxPnt) {
            return "포인트는 결제금액의 " + PNT_MAX_USE_RATE + "%(" + maxPnt + "P)까지 사용할 수 있습니다.";
        }
        return null;
    }

    private long codeLong(String grpCd, String cd, long defVal) {
        String v = cmmCodeService.getCodeVal(grpCd, cd);
        if (CmmUtil.isEmpty(v)) {
            log.warn("공통코드 기준값 없음 {}.{} - 기본값 {} 사용", grpCd, cd, defVal);
            return defVal;
        }
        return Long.parseLong(v.trim());
    }

    // =====================================================================
    // 상태 변경
    // =====================================================================

    /**
     * 주문상태 변경. 모든 상태 변경은 이 메서드를 거쳐 TB_ORD_STAT_HIST 에 남긴다.
     */
    @Transactional
    public void changeStat(String ordNo, String afStat, String chgId) {
        changeStat(ordNo, afStat, chgId, null);
    }

    @Transactional
    public void changeStat(String ordNo, String afStat, String chgId, String rsn) {
        Map<String, Object> ord = ordMapper.selectOrdForUpdate(ordNo);
        if (ord == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
        }
        String bfStat = CmmUtil.str(ord, "ORD_STAT");
        if (bfStat.equals(afStat)) {
            log.info("주문상태 동일 - 변경 생략 ordNo={} stat={}", ordNo, afStat);
            return;
        }
        if (ORD_STAT_CANCELED.equals(bfStat)) {
            throw new BizException("취소된 주문은 상태를 변경할 수 없습니다: " + ordNo);
        }

        Map<String, Object> p = new HashMap<>();
        p.put("ORD_NO", ordNo);
        p.put("AF_STAT", afStat);
        p.put("CHG_ID", chgId);
        p.put("CNCL_RSN", rsn);
        p.put("CNFM_TYPE", BATCH_ID.equals(chgId) ? "A" : "M");
        ordMapper.updateOrdStat(p);

        Map<String, Object> h = new HashMap<>();
        h.put("ORD_NO", ordNo);
        h.put("BF_STAT", bfStat);
        h.put("AF_STAT", afStat);
        h.put("CHG_RSN", rsn);
        h.put("CHG_ID", chgId);
        ordMapper.insertStatHist(h);

        log.info("주문상태 변경 ordNo={} {} -> {} by {}", ordNo, bfStat, afStat, chgId);
    }

    @Transactional
    public void changeItemStat(String ordNo, int itemSeq, String itemStat) {
        Map<String, Object> key = new HashMap<>();
        key.put("ORD_NO", ordNo);
        key.put("ITEM_SEQ", itemSeq);
        Map<String, Object> item = ordMapper.selectOrdItem(key);
        if (item == null) {
            throw new BizException("주문상품을 찾을 수 없습니다: " + ordNo + "-" + itemSeq);
        }
        String bf = CmmUtil.str(item, "ITEM_STAT");
        if (ITEM_STAT_CANCEL.equals(bf) || ITEM_STAT_RTN_CMPL.equals(bf)) {
            throw new BizException("이미 취소/반품완료된 상품입니다: " + ordNo + "-" + itemSeq);
        }
        key.put("ITEM_STAT", itemStat);
        ordMapper.updateItemStat(key);
    }

    // =====================================================================
    // 상품준비
    // =====================================================================

    /**
     * 상품준비. 결제완료(20) 주문을 상품준비(30)로 바꾸고 배송건을 만든다.
     * 출고 전 부분취소(80)된 주문도 배송건이 아직 없으면 상품준비 가능.
     */
    @Transactional
    public int prepareOrd(List<Map<String, Object>> rows, String chgId) {
        if (rows == null || rows.isEmpty()) {
            throw new BizException("상품준비할 주문을 선택하세요.");
        }
        int cnt = 0;
        for (Map<String, Object> row : rows) {
            String ordNo = CmmUtil.str(row, "ORD_NO");
            Map<String, Object> ord = ordMapper.selectOrdForUpdate(ordNo);
            if (ord == null) {
                throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
            }
            String ordStat = CmmUtil.str(ord, "ORD_STAT");
            boolean ok = ORD_STAT_PAID.equals(ordStat)
                    || (ORD_STAT_PART_CNCL.equals(ordStat) && dlvService.getDlv(ordNo) == null);
            if (!ok) {
                throw new BizException("결제완료 상태의 주문만 상품준비할 수 있습니다. [" + ordNo + "]");
            }

            Map<String, Object> pay = payService.getPay(ordNo);
            if (pay == null || PAY_STAT_WAIT.equals(CmmUtil.str(pay, "PAY_STAT"))) {
                throw new BizException("결제가 확인되지 않은 주문입니다. [" + ordNo + "]");
            }
            validateOrdAmt(ord);

            changeStat(ordNo, ORD_STAT_PREPARE, chgId);
            dlvService.createDlv(ordNo);
            cnt++;
        }
        log.info("상품준비 처리 {}건 by {}", cnt, chgId);
        return cnt;
    }

    // =====================================================================
    // 주문취소
    // =====================================================================

    /**
     * 주문 전체취소.
     * 결제취소 → 쿠폰복원 → 포인트 사용취소 → 재고 예약해제 → 주문상태 90
     */
    @Transactional
    public void cancelOrd(String ordNo, String rsn, String chgId) {
        Map<String, Object> ord = ordMapper.selectOrdForUpdate(ordNo);
        if (ord == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
        }
        String ordStat = CmmUtil.str(ord, "ORD_STAT");
        if (!ORD_STAT_RECEIVED.equals(ordStat)) {
            throw new BizException("주문접수 상태에서만 취소할 수 있습니다.");
        }
        if (CmmUtil.isEmpty(rsn)) {
            rsn = "관리자 주문취소";
        }

        // 1. 결제취소
        Map<String, Object> pay = payService.getPay(ordNo);
        if (pay != null) {
            String payStat = CmmUtil.str(pay, "PAY_STAT");
            if (PAY_STAT_APPROVED.equals(payStat) || PAY_STAT_PART_CNCL.equals(payStat)) {
                payService.cancelAll(ordNo, rsn);
            } else if (PAY_STAT_WAIT.equals(payStat)) {
                // 가상계좌 미입금: PG 취소 없이 결제건만 취소 처리
                payService.cancelAll(ordNo, rsn);
            } else {
                log.info("결제취소 대상 아님 ordNo={} payStat={}", ordNo, payStat);
            }
        }

        // 2. 쿠폰 복원
        Map<String, Object> usedCpn = cpnService.getUsedCpn(ordNo);
        if (usedCpn != null) {
            cpnService.restore(ordNo);
        }

        // 3. 포인트 사용취소
        long pntUseAmt = CmmUtil.lng(ord, "PNT_USE_AMT");
        if (pntUseAmt > 0) {
            pntService.cancelUse(ordNo, pntUseAmt);
        }

        // 4. 재고 예약 해제
        List<Map<String, Object>> items = ordMapper.selectOrdItemList(ordNo);
        for (Map<String, Object> item : items) {
            if (!ITEM_STAT_NORMAL.equals(CmmUtil.str(item, "ITEM_STAT"))) {
                continue;
            }
            stkService.release(CmmUtil.str(item, "PRD_CD"), CmmUtil.intg(item, "QTY"), ordNo);
            Map<String, Object> p = new HashMap<>();
            p.put("ORD_NO", ordNo);
            p.put("ITEM_SEQ", CmmUtil.intg(item, "ITEM_SEQ"));
            p.put("ITEM_STAT", ITEM_STAT_CANCEL);
            ordMapper.updateItemStat(p);
        }

        // 5. 주문상태
        changeStat(ordNo, ORD_STAT_CANCELED, chgId, rsn);
        log.info("주문취소 완료 ordNo={} by {}", ordNo, chgId);
    }

    // =====================================================================
    // 부분취소
    // =====================================================================

    /**
     * 출고 전 상품단위 부분취소.
     * <pre>
     * - 대상: 결제완료(20), 상품준비(30), 부분취소(80) 주문의 정상(N) 상품
     * - 쿠폰할인/포인트는 상품금액 비율로 안분 (10원 미만 절사, 마지막 전체취소 시 잔액 몰아줌)
     * - 환불액 = 상품금액 - 쿠폰안분 - 포인트안분
     *   전체 상품이 취소되면 배송비 포함, 남은 상품금액이 무료배송 기준 미만이 되면 기본배송비 차감
     * - 남은 상품이 없으면 쿠폰 복원 + 주문취소(90), 아니면 부분취소(80)
     * </pre>
     */
    @Transactional
    public Map<String, Object> partCancelOrd(String ordNo, List<Map<String, Object>> cnclItems, String rsn, String chgId) {
        Map<String, Object> ord = ordMapper.selectOrdForUpdate(ordNo);
        if (ord == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
        }
        String ordStat = CmmUtil.str(ord, "ORD_STAT");
        if (!ORD_STAT_PAID.equals(ordStat) && !ORD_STAT_PREPARE.equals(ordStat) && !ORD_STAT_PART_CNCL.equals(ordStat)) {
            throw new BizException("출고 전(결제완료/상품준비) 주문만 부분취소할 수 있습니다.");
        }
        if (ORD_STAT_PART_CNCL.equals(ordStat)) {
            Map<String, Object> dlv = dlvService.getDlv(ordNo);
            if (dlv != null && !"R".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
                throw new BizException("이미 출고된 주문은 부분취소할 수 없습니다. 반품으로 접수하세요.");
            }
        }
        if (cnclItems == null || cnclItems.isEmpty()) {
            throw new BizException("취소할 상품을 선택하세요.");
        }
        if (CmmUtil.isEmpty(rsn)) {
            rsn = "관리자 부분취소";
        }

        Set<Integer> cnclSeqs = new HashSet<>();
        for (Map<String, Object> c : cnclItems) {
            cnclSeqs.add(CmmUtil.intg(c, "ITEM_SEQ"));
        }

        long ordAmt = CmmUtil.lng(ord, "ORD_AMT");
        long cpnDcAmt = CmmUtil.lng(ord, "CPN_DC_AMT");
        long pntUseAmt = CmmUtil.lng(ord, "PNT_USE_AMT");
        long dlvFee = CmmUtil.lng(ord, "DLV_FEE");

        List<Map<String, Object>> items = ordMapper.selectOrdItemList(ordNo);
        List<Map<String, Object>> targets = new ArrayList<>();
        long remainItemAmt = 0L;
        long sharedCpn = 0L;
        long sharedPnt = 0L;
        for (Map<String, Object> item : items) {
            int seq = CmmUtil.intg(item, "ITEM_SEQ");
            String itemStat = CmmUtil.str(item, "ITEM_STAT");
            if (ITEM_STAT_CANCEL.equals(itemStat)) {
                sharedCpn += CmmUtil.lng(item, "CPN_DC_SHARE_AMT");
                sharedPnt += CmmUtil.lng(item, "PNT_SHARE_AMT");
            }
            if (cnclSeqs.contains(seq)) {
                if (!ITEM_STAT_NORMAL.equals(itemStat)) {
                    throw new BizException("정상 상태의 상품만 취소할 수 있습니다. [" + seq + "번 상품]");
                }
                targets.add(item);
            } else if (ITEM_STAT_NORMAL.equals(itemStat)) {
                remainItemAmt += CmmUtil.lng(item, "ITEM_AMT");
            }
        }
        if (targets.size() != cnclSeqs.size()) {
            throw new BizException("주문에 없는 상품이 포함되어 있습니다.");
        }
        boolean allCancel = remainItemAmt == 0L;

        // 쿠폰/포인트 안분
        long totCpnShare = 0L;
        long totPntShare = 0L;
        long totItemRefund = 0L;
        for (int i = 0; i < targets.size(); i++) {
            Map<String, Object> item = targets.get(i);
            long itemAmt = CmmUtil.lng(item, "ITEM_AMT");
            long cpnShare;
            long pntShare;
            if (allCancel && i == targets.size() - 1) {
                cpnShare = cpnDcAmt - sharedCpn - totCpnShare;
                pntShare = pntUseAmt - sharedPnt - totPntShare;
            } else {
                cpnShare = ordAmt == 0 ? 0 : CmmUtil.truncWon((double) cpnDcAmt * itemAmt / ordAmt);
                pntShare = ordAmt == 0 ? 0 : CmmUtil.truncWon((double) pntUseAmt * itemAmt / ordAmt);
            }
            long refund = itemAmt - cpnShare - pntShare;
            if (refund < 0) {
                refund = 0;
            }
            item.put("CPN_DC_SHARE_AMT", cpnShare);
            item.put("PNT_SHARE_AMT", pntShare);
            item.put("REFUND_AMT", refund);
            totCpnShare += cpnShare;
            totPntShare += pntShare;
            totItemRefund += refund;
        }

        // 배송비
        long dlvAdj = 0L;
        if (allCancel) {
            dlvAdj = dlvFee;
        } else if (dlvFee == 0L && remainItemAmt < codeLong("DLV_FEE", "FREE_MIN", 50000L)) {
            dlvAdj = -codeLong("DLV_FEE", "BASE", 3000L);
        }
        long cashRefund = totItemRefund + dlvAdj;
        if (cashRefund < 0) {
            cashRefund = 0;
        }

        // 1. 결제 부분취소
        Map<String, Object> pay = payService.getPay(ordNo);
        if (pay != null && cashRefund > 0) {
            payService.cancelPart(ordNo, cashRefund, rsn, null);
        }

        // 2. 포인트 사용취소 (안분분)
        if (totPntShare > 0) {
            pntService.cancelUse(ordNo, totPntShare);
        }

        // 3. 쿠폰: 전체 상품이 취소된 경우에만 복원
        if (allCancel && cpnService.getUsedCpn(ordNo) != null) {
            cpnService.restore(ordNo);
        }

        // 4. 재고 예약 해제 + 상품 취소
        for (Map<String, Object> item : targets) {
            stkService.release(CmmUtil.str(item, "PRD_CD"), CmmUtil.intg(item, "QTY"), ordNo);
            item.put("ORD_NO", ordNo);
            int upd = ordMapper.updateItemCncl(item);
            if (upd != 1) {
                throw new BizException("이미 처리된 상품입니다. 다시 조회하세요.");
            }
        }

        Map<String, Object> amt = new HashMap<>();
        amt.put("ORD_NO", ordNo);
        amt.put("ADD_CNCL_AMT", cashRefund);
        amt.put("CHG_ID", chgId);
        ordMapper.updateOrdCnclAmt(amt);

        // 5. 주문상태
        changeStat(ordNo, allCancel ? ORD_STAT_CANCELED : ORD_STAT_PART_CNCL, chgId, rsn);

        log.info("부분취소 ordNo={} items={} refund={} cpnShare={} pntShare={} dlvAdj={} all={}",
                ordNo, cnclSeqs, cashRefund, totCpnShare, totPntShare, dlvAdj, allCancel);

        Map<String, Object> res = new HashMap<>();
        res.put("REFUND_AMT", cashRefund);
        res.put("CPN_DC_SHARE_AMT", totCpnShare);
        res.put("PNT_SHARE_AMT", totPntShare);
        res.put("DLV_ADJ_AMT", dlvAdj);
        res.put("ALL_CNCL_YN", allCancel ? "Y" : "N");
        return res;
    }

    // =====================================================================
    // 구매확정
    // =====================================================================

    /**
     * 구매확정. 배송완료(50) → 구매확정(60), 포인트 적립.
     */
    @Transactional
    public void confirmPurchase(String ordNo, String chgId) {
        Map<String, Object> ord = ordMapper.selectOrdForUpdate(ordNo);
        if (ord == null) {
            throw new BizException("주문을 찾을 수 없습니다: " + ordNo);
        }
        if (!ORD_STAT_DELIVERED.equals(CmmUtil.str(ord, "ORD_STAT"))) {
            throw new BizException("배송완료 상태에서만 구매확정할 수 있습니다.");
        }
        for (Map<String, Object> item : ordMapper.selectOrdItemList(ordNo)) {
            if (ITEM_STAT_RTN_REQ.equals(CmmUtil.str(item, "ITEM_STAT"))) {
                throw new BizException("반품 진행 중인 상품이 있어 구매확정할 수 없습니다.");
            }
        }
        changeStat(ordNo, ORD_STAT_CONFIRMED, chgId);
        pntService.earn(ordNo);
        log.info("구매확정 ordNo={} by {}", ordNo, chgId);
    }

    /** 화면 다건 구매확정 */
    @Transactional
    public int confirmPurchaseList(List<Map<String, Object>> rows, String chgId) {
        int cnt = 0;
        for (Map<String, Object> row : rows) {
            confirmPurchase(CmmUtil.str(row, "ORD_NO"), chgId);
            cnt++;
        }
        return cnt;
    }

    /**
     * 자동 구매확정 배치. 매일 05:00.
     * 배송완료일(TB_DLV.DLV_CMPL_DT) 로부터 7일이 지난 주문을 구매확정한다.
     * 건별 트랜잭션으로 처리하고 실패 건은 로그만 남기고 다음 건 진행.
     */
    @Scheduled(cron = "${commerce.ord.auto-cnfm-cron}")
    public void autoConfirmBatch() {
        Map<String, Object> param = new HashMap<>();
        param.put("CNFM_DAYS", AUTO_CNFM_DAYS);
        List<Map<String, Object>> targets = ordMapper.selectAutoCnfmTargetList(param);
        log.info("[자동구매확정] 대상 {}건", targets.size());

        LocalDate today = LocalDate.now();
        int ok = 0;
        int skip = 0;
        int fail = 0;
        for (Map<String, Object> t : targets) {
            final String ordNo = CmmUtil.str(t, "ORD_NO");
            try {
                Map<String, Object> dlv = dlvService.getDlv(ordNo);
                String cmplDt = dlv == null ? "" : CmmUtil.str(dlv, "DLV_CMPL_DT");
                if (CmmUtil.isEmpty(cmplDt) || !"D".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
                    skip++;
                    continue;
                }
                long days = ChronoUnit.DAYS.between(LocalDate.parse(cmplDt.substring(0, 8), YMD), today);
                if (days < AUTO_CNFM_DAYS) {
                    skip++;
                    continue;
                }
                txTemplate.execute(status -> {
                    confirmPurchase(ordNo, BATCH_ID);
                    return null;
                });
                ok++;
            } catch (Exception e) {
                fail++;
                log.error("[자동구매확정] 실패 ordNo={} : {}", ordNo, e.getMessage());
            }
        }
        log.info("[자동구매확정] 완료 성공 {} / 제외 {} / 실패 {}", ok, skip, fail);
    }
}
