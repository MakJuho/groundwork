package com.example.commerce.clm;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.cpn.CpnService;
import com.example.commerce.dlv.DlvService;
import com.example.commerce.ord.OrdService;
import com.example.commerce.pay.PayService;
import com.example.commerce.pnt.PntService;
import com.example.commerce.prd.PrdService;
import com.example.commerce.stk.StkService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 클레임(반품) 처리.
 *
 * 접수(REQ) → 회수중(COL) → 완료(CMP) / 거부(REJ)
 * 반품 접수 시 주문상품은 R(반품요청), 완료 시 X(반품완료), 거부 시 N(정상)으로 돌아간다.
 */
@Service("clmService")
public class ClmServiceImpl implements ClmService {

    private static final Logger log = LoggerFactory.getLogger(ClmServiceImpl.class);

    /** 반품 접수 가능 기간 (배송완료일로부터, 달력 기준) */
    private static final int RETURN_LIMIT_DAYS = 7;

    static final String CLM_TYPE_RTN = "RTN";
    static final String CLM_STAT_REQ = "REQ";
    static final String CLM_STAT_COL = "COL";
    static final String CLM_STAT_CMP = "CMP";
    static final String CLM_STAT_REJ = "REJ";

    static final String ORD_STAT_DLV_CMPL = "50";
    static final String ORD_STAT_CONFIRM = "60";
    static final String ORD_STAT_PART_CNCL = "80";
    static final String ORD_STAT_CNCL = "90";

    static final String ITEM_STAT_NORMAL = "N";
    static final String ITEM_STAT_CANCEL = "C";
    static final String ITEM_STAT_RTN_REQ = "R";
    static final String ITEM_STAT_RTN_CMP = "X";

    static final String PAYER_CUST = "C";
    static final String PAYER_SELLER = "S";

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final ClmMapper clmMapper;
    private final SeqService seqService;
    private final CmmCodeService cmmCodeService;
    private final OrdService ordService;
    private final PayService payService;
    private final PntService pntService;
    private final CpnService cpnService;
    private final StkService stkService;
    private final DlvService dlvService;
    private final PrdService prdService;

    public ClmServiceImpl(ClmMapper clmMapper, SeqService seqService, CmmCodeService cmmCodeService,
                          OrdService ordService, PayService payService, PntService pntService,
                          CpnService cpnService, StkService stkService, DlvService dlvService,
                          PrdService prdService) {
        this.clmMapper = clmMapper;
        this.seqService = seqService;
        this.cmmCodeService = cmmCodeService;
        this.ordService = ordService;
        this.payService = payService;
        this.pntService = pntService;
        this.cpnService = cpnService;
        this.stkService = stkService;
        this.dlvService = dlvService;
        this.prdService = prdService;
    }

    @Override
    public List<Map<String, Object>> selectClmList(Map<String, Object> search) {
        return clmMapper.selectClmList(search);
    }

    @Override
    public Map<String, List<Map<String, Object>>> selectClmDetail(String clmNo, String ordNo) {
        Map<String, List<Map<String, Object>>> result = new LinkedHashMap<>();
        List<Map<String, Object>> clmList = new ArrayList<>();
        List<Map<String, Object>> clmItemList = new ArrayList<>();

        if (!CmmUtil.isEmpty(clmNo)) {
            Map<String, Object> clm = clmMapper.selectClm(clmNo);
            if (clm == null) {
                throw new BizException("클레임 정보가 없습니다: " + clmNo);
            }
            clmList.add(clm);
            clmItemList = clmMapper.selectClmItemList(clmNo);
            ordNo = CmmUtil.str(clm, "ORD_NO");
        }
        if (CmmUtil.isEmpty(ordNo)) {
            throw new BizException("클레임번호 또는 주문번호를 입력하세요.");
        }

        Map<String, Object> ord = ordService.getOrd(ordNo);
        Map<String, Object> ordRow = new HashMap<>(ord);
        Map<String, Object> dlv = dlvService.getDlv(ordNo);
        if (dlv != null) {
            ordRow.put("DLV_STAT", dlv.get("DLV_STAT"));
            ordRow.put("DLV_CMPL_DT", dlv.get("DLV_CMPL_DT"));
        }
        ordRow.put("PAY_REMAIN_AMT", getPayRemainAmt(ordNo));
        List<Map<String, Object>> ordList = new ArrayList<>();
        ordList.add(ordRow);

        List<Map<String, Object>> ordItemList = new ArrayList<>();
        for (Map<String, Object> item : ordService.getOrdItems(ordNo)) {
            Map<String, Object> row = new HashMap<>(item);
            Map<String, Object> prd = prdService.getPrd(CmmUtil.str(item, "PRD_CD"));
            row.put("PRD_NM", prd.get("PRD_NM"));
            row.put("RTN_FEE", prd.get("RTN_FEE"));
            row.put("CHK", "0");
            ordItemList.add(row);
        }

        result.put("ds_clm", clmList);
        result.put("ds_clmItem", clmItemList);
        result.put("ds_ord", ordList);
        result.put("ds_ordItem", ordItemList);
        result.put("ds_ordClm", clmMapper.selectClmListByOrd(ordNo));
        return result;
    }

    /**
     * 반품 접수.
     * - 배송완료 상태 주문만 (구매확정 후 불가)
     * - 배송완료일로부터 7일 이내
     * - 이미 반품요청/완료된 상품은 중복 접수 불가
     * - 사유의 부담주체(CLM_RSN.CD_VAL1)에 따라 반품비 결정
     */
    @Override
    @Transactional
    public String requestReturn(Map<String, Object> clm, List<Map<String, Object>> itemList, String userId) {
        String ordNo = CmmUtil.str(clm, "ORD_NO");
        String clmRsn = CmmUtil.str(clm, "CLM_RSN");
        if (CmmUtil.isEmpty(ordNo)) {
            throw new BizException("주문번호는 필수입니다.");
        }
        if (CmmUtil.isEmpty(clmRsn)) {
            throw new BizException("반품 사유를 선택하세요.");
        }
        if (itemList == null || itemList.isEmpty()) {
            throw new BizException("반품할 상품을 선택하세요.");
        }

        Map<String, Object> ord = ordService.getOrd(ordNo);
        String ordStat = CmmUtil.str(ord, "ORD_STAT");
        if (ORD_STAT_CONFIRM.equals(ordStat)) {
            throw new BizException("구매확정된 주문은 반품할 수 없습니다.");
        }
        // 2022.02 부분반품 이후 남은 상품 추가 반품 허용 (운영요청 #2291)
        // if (!ORD_STAT_DLV_CMPL.equals(ordStat)) {
        if (!ORD_STAT_DLV_CMPL.equals(ordStat) && !ORD_STAT_PART_CNCL.equals(ordStat)) {
            throw new BizException("배송완료된 주문만 반품 접수할 수 있습니다. (현재 상태: " + ordStat + ")");
        }

        Map<String, Object> dlv = dlvService.getDlv(ordNo);
        if (dlv == null || !"D".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
            throw new BizException("배송완료된 주문만 반품 접수할 수 있습니다.");
        }
        String dlvCmplDt = CmmUtil.str(dlv, "DLV_CMPL_DT");
        long passDays = ChronoUnit.DAYS.between(LocalDate.parse(dlvCmplDt, YMD), LocalDate.parse(CmmUtil.today(), YMD));
        if (passDays > RETURN_LIMIT_DAYS) {
            throw new BizException("배송완료 후 7일이 지나 반품 접수가 불가합니다.");
        }

        String payer = cmmCodeService.getCodeVal("CLM_RSN", clmRsn);
        if (CmmUtil.isEmpty(payer)) {
            throw new BizException("반품 사유가 올바르지 않습니다: " + clmRsn);
        }

        Map<Integer, Map<String, Object>> ordItemMap = new HashMap<>();
        for (Map<String, Object> ordItem : ordService.getOrdItems(ordNo)) {
            ordItemMap.put(CmmUtil.intg(ordItem, "ITEM_SEQ"), ordItem);
        }

        Set<Integer> seqSet = new HashSet<>();
        List<Map<String, Object>> rtnItemList = new ArrayList<>();
        long maxRtnFee = 0;
        for (Map<String, Object> item : itemList) {
            int itemSeq = CmmUtil.intg(item, "ITEM_SEQ");
            if (!seqSet.add(itemSeq)) {
                continue;
            }
            Map<String, Object> ordItem = ordItemMap.get(itemSeq);
            if (ordItem == null) {
                throw new BizException("주문상품 정보가 없습니다. 순번: " + itemSeq);
            }
            String itemStat = CmmUtil.str(ordItem, "ITEM_STAT");
            if (ITEM_STAT_RTN_REQ.equals(itemStat)) {
                throw new BizException("이미 반품요청된 상품입니다. 순번: " + itemSeq);
            }
            if (ITEM_STAT_RTN_CMP.equals(itemStat)) {
                throw new BizException("이미 반품완료된 상품입니다. 순번: " + itemSeq);
            }
            if (ITEM_STAT_CANCEL.equals(itemStat)) {
                throw new BizException("취소된 상품은 반품할 수 없습니다. 순번: " + itemSeq);
            }
            Map<String, Object> param = new HashMap<>();
            param.put("ORD_NO", ordNo);
            param.put("ITEM_SEQ", itemSeq);
            if (clmMapper.selectActiveClmItemCnt(param) > 0) {
                throw new BizException("이미 클레임이 진행중인 상품입니다. 순번: " + itemSeq);
            }

            if (PAYER_CUST.equals(payer)) {
                Map<String, Object> prd = prdService.getPrd(CmmUtil.str(ordItem, "PRD_CD"));
                maxRtnFee = Math.max(maxRtnFee, CmmUtil.lng(prd, "RTN_FEE"));
            }
            rtnItemList.add(ordItem);
        }

        long rtnFee = 0;
        if (PAYER_CUST.equals(payer)) {
            rtnFee = maxRtnFee;
            // 무료배송 주문은 최초 배송비까지 고객 부담 (왕복)
            if (CmmUtil.lng(ord, "DLV_FEE") == 0) {
                rtnFee = rtnFee * 2;
            }
        }

        String clmNo = seqService.next("CLM");
        Map<String, Object> clmParam = new HashMap<>();
        clmParam.put("CLM_NO", clmNo);
        clmParam.put("ORD_NO", ordNo);
        clmParam.put("CLM_TYPE", CLM_TYPE_RTN);
        clmParam.put("CLM_STAT", CLM_STAT_REQ);
        clmParam.put("CLM_RSN", clmRsn);
        clmParam.put("CLM_RSN_DTL", CmmUtil.str(clm, "CLM_RSN_DTL"));
        clmParam.put("RTN_FEE", rtnFee);
        clmParam.put("RTN_FEE_PAYER", payer);
        clmParam.put("REG_ID", userId);
        clmMapper.insertClm(clmParam);

        for (Map<String, Object> ordItem : rtnItemList) {
            Map<String, Object> itemParam = new HashMap<>();
            itemParam.put("CLM_NO", clmNo);
            itemParam.put("ORD_NO", ordNo);
            itemParam.put("ITEM_SEQ", CmmUtil.intg(ordItem, "ITEM_SEQ"));
            itemParam.put("PRD_CD", CmmUtil.str(ordItem, "PRD_CD"));
            itemParam.put("QTY", CmmUtil.intg(ordItem, "QTY"));
            itemParam.put("ITEM_AMT", CmmUtil.lng(ordItem, "ITEM_AMT"));
            clmMapper.insertClmItem(itemParam);
            ordService.changeItemStat(ordNo, CmmUtil.intg(ordItem, "ITEM_SEQ"), ITEM_STAT_RTN_REQ);
        }

        // 2021.03 회수지시 자동화 - 접수 즉시 회수중으로 전환 (택배 회수는 택배사 일괄 접수)
        Map<String, Object> statParam = new HashMap<>();
        statParam.put("CLM_NO", clmNo);
        statParam.put("CLM_STAT", CLM_STAT_COL);
        statParam.put("BF_CLM_STAT", CLM_STAT_REQ);
        statParam.put("UPD_ID", userId);
        clmMapper.updateClmStat(statParam);

        log.info("반품 접수 clmNo={} ordNo={} items={} rsn={} payer={} rtnFee={}",
                clmNo, ordNo, rtnItemList.size(), clmRsn, payer, rtnFee);
        return clmNo;
    }

    /**
     * 회수 완료 처리.
     * 환불은 결제수단 우선, 결제수단 잔여 취소가능액을 넘는 금액은 사용 포인트로 환원한다.
     */
    @Override
    @Transactional
    public long completeReturn(String clmNo, String userId) {
        Map<String, Object> clm = clmMapper.selectClm(clmNo);
        if (clm == null) {
            throw new BizException("클레임 정보가 없습니다: " + clmNo);
        }
        if (!CLM_STAT_COL.equals(CmmUtil.str(clm, "CLM_STAT"))) {
            throw new BizException("회수중 상태의 클레임만 완료 처리할 수 있습니다.");
        }
        String ordNo = CmmUtil.str(clm, "ORD_NO");
        Map<String, Object> ord = ordService.getOrd(ordNo);
        List<Map<String, Object>> clmItemList = clmMapper.selectClmItemList(clmNo);
        if (clmItemList.isEmpty()) {
            throw new BizException("클레임 상품이 없습니다: " + clmNo);
        }

        // 1. 환불금액
        long refundAmt = calcRefundAmt(clm, clmItemList, ord);
        for (Map<String, Object> clmItem : clmItemList) {
            Map<String, Object> param = new HashMap<>();
            param.put("CLM_NO", clmNo);
            param.put("ITEM_SEQ", CmmUtil.intg(clmItem, "ITEM_SEQ"));
            param.put("CPN_DC_SHARE_AMT", CmmUtil.lng(clmItem, "CPN_DC_SHARE_AMT"));
            param.put("REFUND_AMT", CmmUtil.lng(clmItem, "REFUND_AMT"));
            clmMapper.updateClmItemRefund(param);
        }

        // 2. 결제 취소 (결제수단 우선) → 남는 금액은 포인트 환원
        long payRemain = getPayRemainAmt(ordNo);
        long payRefund = Math.min(refundAmt, payRemain);
        long pntRefund = refundAmt - payRefund;
        if (payRefund > 0) {
            payService.cancelPart(ordNo, payRefund, "반품환불", clmNo);
        }
        if (pntRefund > 0) {
            pntService.cancelUse(ordNo, pntRefund);
        }
        log.info("반품 환불 clmNo={} refund={} pay={} pnt={}", clmNo, refundAmt, payRefund, pntRefund);

        // 3. 전체반품 여부 (이번 클레임 상품을 반품완료로 보고 판단)
        Set<Integer> clmSeqSet = new HashSet<>();
        for (Map<String, Object> clmItem : clmItemList) {
            clmSeqSet.add(CmmUtil.intg(clmItem, "ITEM_SEQ"));
        }
        boolean fullReturn = true;
        for (Map<String, Object> ordItem : ordService.getOrdItems(ordNo)) {
            if (clmSeqSet.contains(CmmUtil.intg(ordItem, "ITEM_SEQ"))) {
                continue;
            }
            String itemStat = CmmUtil.str(ordItem, "ITEM_STAT");
            if (!ITEM_STAT_CANCEL.equals(itemStat) && !ITEM_STAT_RTN_CMP.equals(itemStat)) {
                fullReturn = false;
                break;
            }
        }

        // 4. 적립 포인트 회수 (구매확정 전이라 보통 적립 내역 없음)
        if (!CmmUtil.isEmpty(CmmUtil.str(ord, "CNFM_DT"))) {
            if (fullReturn) {
                pntService.cancelEarn(ordNo, 0L);
            } else {
                log.warn("구매확정 주문 부분반품 - 적립 포인트는 관리자 조정으로 회수 ordNo={} clmNo={}", ordNo, clmNo);
            }
        }

        // 5. 쿠폰 원복 (전체반품만)
        if (fullReturn) {
            cpnService.restore(ordNo);
        }

        // 6. 재고 입고, 주문상품 반품완료
        for (Map<String, Object> clmItem : clmItemList) {
            stkService.restock(CmmUtil.str(clmItem, "PRD_CD"), CmmUtil.intg(clmItem, "QTY"), ordNo);
            ordService.changeItemStat(ordNo, CmmUtil.intg(clmItem, "ITEM_SEQ"), ITEM_STAT_RTN_CMP);
        }

        // 7. 주문 상태
        String afStat = fullReturn ? ORD_STAT_CNCL : ORD_STAT_PART_CNCL;
        if (!afStat.equals(CmmUtil.str(ord, "ORD_STAT"))) {
            ordService.changeStat(ordNo, afStat, userId);
        }

        // 8. 클레임 완료
        Map<String, Object> param = new HashMap<>();
        param.put("CLM_NO", clmNo);
        param.put("REFUND_AMT", refundAmt);
        param.put("REFUND_PNT_AMT", pntRefund);
        param.put("UPD_ID", userId);
        clmMapper.updateClmComplete(param);

        log.info("반품 완료 clmNo={} ordNo={} fullReturn={} ordStat={}", clmNo, ordNo, fullReturn, afStat);
        return refundAmt;
    }

    /**
     * 반품 환불금액.
     * 상품금액 합계 - 쿠폰할인 차감액 - 반품비.
     * 쿠폰은 주문 단위 할인이므로, 해당 주문의 첫 반품에서 할인액 전액을 차감하고 이후 반품에서는 차감하지 않는다.
     */
    @Override
    public long calcRefundAmt(Map<String, Object> clm, List<Map<String, Object>> clmItemList, Map<String, Object> ord) {
        String clmNo = CmmUtil.str(clm, "CLM_NO");
        String ordNo = CmmUtil.str(clm, "ORD_NO");
        long rtnFee = CmmUtil.lng(clm, "RTN_FEE");
        long cpnDcAmt = CmmUtil.lng(ord, "CPN_DC_AMT");

        long cpnDeductAmt = 0;
        if (cpnDcAmt > 0) {
            Map<String, Object> param = new HashMap<>();
            param.put("ORD_NO", ordNo);
            param.put("CLM_NO", clmNo);
            int prevCnt = clmMapper.selectCmpRtnClmCnt(param);
            if (prevCnt == 0) {
                cpnDeductAmt = cpnDcAmt;
            }
        }

        // 2019.11 환불기준 정리 - 쿠폰 차감액은 클레임 첫 상품에 기록
        long itemTotal = 0;
        boolean first = true;
        for (Map<String, Object> clmItem : clmItemList) {
            long itemAmt = CmmUtil.lng(clmItem, "ITEM_AMT");
            long share = first ? cpnDeductAmt : 0L;
            clmItem.put("CPN_DC_SHARE_AMT", share);
            clmItem.put("REFUND_AMT", itemAmt - share);
            itemTotal += itemAmt;
            first = false;
        }

        long refundAmt = itemTotal - cpnDeductAmt - rtnFee;
        if (refundAmt < 0) {
            log.warn("환불금액 음수 보정 clmNo={} items={} cpn={} rtnFee={}", clmNo, itemTotal, cpnDeductAmt, rtnFee);
            refundAmt = 0;
        }
        return refundAmt;
    }

    @Override
    @Transactional
    public void rejectClm(String clmNo, String rejRsn, String userId) {
        if (CmmUtil.isEmpty(rejRsn)) {
            throw new BizException("거부 사유를 입력하세요.");
        }
        Map<String, Object> clm = clmMapper.selectClm(clmNo);
        if (clm == null) {
            throw new BizException("클레임 정보가 없습니다: " + clmNo);
        }
        String clmStat = CmmUtil.str(clm, "CLM_STAT");
        if (!CLM_STAT_REQ.equals(clmStat) && !CLM_STAT_COL.equals(clmStat)) {
            throw new BizException("접수/회수중 상태의 클레임만 거부할 수 있습니다.");
        }
        String ordNo = CmmUtil.str(clm, "ORD_NO");
        for (Map<String, Object> clmItem : clmMapper.selectClmItemList(clmNo)) {
            ordService.changeItemStat(ordNo, CmmUtil.intg(clmItem, "ITEM_SEQ"), ITEM_STAT_NORMAL);
        }
        Map<String, Object> param = new HashMap<>();
        param.put("CLM_NO", clmNo);
        param.put("REJ_RSN", rejRsn);
        param.put("UPD_ID", userId);
        clmMapper.updateClmReject(param);
        log.info("클레임 거부 clmNo={} ordNo={} rsn={}", clmNo, ordNo, rejRsn);
    }

    /** 결제수단 취소 가능 잔액 (승인/부분취소 상태만) */
    private long getPayRemainAmt(String ordNo) {
        Map<String, Object> pay = payService.getPay(ordNo);
        if (pay == null) {
            return 0L;
        }
        String payStat = CmmUtil.str(pay, "PAY_STAT");
        if (!"A".equals(payStat) && !"P".equals(payStat)) {
            return 0L;
        }
        if ("PNT".equals(CmmUtil.str(pay, "PAY_MTHD"))) {
            return 0L;
        }
        long remain = CmmUtil.lng(pay, "PAY_AMT") - CmmUtil.lng(pay, "CNCL_AMT");
        return Math.max(remain, 0L);
    }
}
