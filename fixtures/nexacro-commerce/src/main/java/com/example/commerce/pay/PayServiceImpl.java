package com.example.commerce.pay;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.ExtIfException;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.ext.PgClient;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결제 서비스 구현.
 * <pre>
 * 2019.05  최초 작성 (카드/가상계좌)
 * 2020.09  포인트전액 결제 추가
 * 2021.03  부분취소(PG v2) 적용
 * 2022.06  운영요청 #1934 취소실패 건 재처리 화면 추가
 * </pre>
 */
@Service("payService")
public class PayServiceImpl implements PayService {

    private static final Logger log = LoggerFactory.getLogger(PayServiceImpl.class);

    static final String PAY_STAT_WAIT = "W";
    static final String PAY_STAT_APPROVED = "A";
    static final String PAY_STAT_PART_CNCL = "P";
    static final String PAY_STAT_CNCL = "C";
    static final String PAY_STAT_FAIL = "E";

    static final String PAY_MTHD_CARD = "CARD";
    static final String PAY_MTHD_VBANK = "VBANK";
    static final String PAY_MTHD_PNT = "PNT";

    /** 할부 가능 최소 결제금액 */
    private static final long INST_MIN_AMT = 50000L;

    private final PayMapper payMapper;
    private final PayCnclFailService payCnclFailService;
    private final PgClient pgClient;
    private final CmmCodeService cmmCodeService;
    private final SeqService seqService;

    public PayServiceImpl(PayMapper payMapper, PayCnclFailService payCnclFailService, PgClient pgClient,
                          CmmCodeService cmmCodeService, SeqService seqService) {
        this.payMapper = payMapper;
        this.payCnclFailService = payCnclFailService;
        this.pgClient = pgClient;
        this.cmmCodeService = cmmCodeService;
        this.seqService = seqService;
    }

    @Override
    public List<Map<String, Object>> selectPayList(Map<String, Object> search) {
        if (CmmUtil.intg(search, "PAGE_NO") <= 0) {
            search.put("PAGE_NO", 1);
        }
        if (CmmUtil.intg(search, "PAGE_SIZE") <= 0) {
            search.put("PAGE_SIZE", 50);
        }
        return payMapper.selectPayList(search);
    }

    @Override
    public int selectPayListCnt(Map<String, Object> search) {
        return payMapper.selectPayListCnt(search);
    }

    @Override
    public Map<String, Object> selectPayDetail(String payNo) {
        Map<String, Object> pay = payMapper.selectPay(payNo);
        if (pay == null) {
            throw new BizException("결제정보를 찾을 수 없습니다: " + payNo);
        }
        return pay;
    }

    @Override
    public List<Map<String, Object>> selectCnclList(String payNo) {
        return payMapper.selectCnclList(payNo);
    }

    @Override
    public Map<String, Object> getPay(String ordNo) {
        return payMapper.selectPayByOrdNo(ordNo);
    }

    /**
     * 승인. 프론트 주문서에서 넘어온 결제요청을 PG 승인 후 TB_PAY에 남긴다.
     * 가상계좌는 PG가 계좌만 발급하고 입금대기(W)로 저장.
     */
    @Override
    @Transactional
    public Map<String, Object> approve(Map<String, Object> req) {
        String ordNo = CmmUtil.str(req, "ORD_NO");
        String payMthd = CmmUtil.str(req, "PAY_MTHD");
        long payAmt = CmmUtil.lng(req, "PAY_AMT");

        Map<String, Object> pay = new HashMap<>(req);
        pay.put("PAY_NO", seqService.next("PAY"));

        if (PAY_MTHD_PNT.equals(payMthd)) {
            // 포인트전액: PG 승인 없음
            pay.put("PAY_AMT", 0L);
            pay.put("PAY_STAT", PAY_STAT_APPROVED);
            payMapper.insertPay(pay);
            return pay;
        }
        if (payAmt <= 0) {
            throw new BizException("결제금액이 올바르지 않습니다.");
        }
        if (PAY_MTHD_CARD.equals(payMthd)) {
            checkInstallment(CmmUtil.str(req, "CARD_CO"), CmmUtil.intg(req, "INST_MM"),
                    CmmUtil.str(req, "FREE_INST_YN"), payAmt);
        }

        Map<String, Object> res = pgClient.approve(req);
        pay.put("PG_TID", res.get("PG_TID"));
        pay.put("APRV_NO", res.get("APRV_NO"));
        if (PAY_MTHD_VBANK.equals(payMthd)) {
            pay.put("VBANK_CD", res.get("VBANK_CD"));
            pay.put("VBANK_NO", res.get("VBANK_NO"));
            pay.put("VBANK_DUE_DT", res.get("VBANK_DUE_DT"));
            pay.put("PAY_STAT", PAY_STAT_WAIT);
        } else {
            pay.put("PAY_STAT", PAY_STAT_APPROVED);
        }
        payMapper.insertPay(pay);
        log.info("결제 승인 ordNo={} payNo={} mthd={} amt={}", ordNo, pay.get("PAY_NO"), payMthd, payAmt);
        return pay;
    }

    /**
     * 할부 조건.
     * - 5만원 미만은 일시불만
     * - 무이자 할부는 카드사별 최대 개월(CARD_CO.CD_VAL1) 이내
     * - 일반 할부는 12개월까지
     */
    @Override
    public void checkInstallment(String cardCo, int instMm, String freeInstYn, long payAmt) {
        if (instMm <= 1) {
            return;
        }
        if (payAmt < INST_MIN_AMT) {
            throw new BizException("5만원 미만 결제는 일시불만 가능합니다.");
        }
        if ("Y".equals(freeInstYn)) {
            String maxMm = getCardCoVal(cardCo, "CD_VAL1");
            if (CmmUtil.isEmpty(maxMm)) {
                throw new BizException("무이자 할부를 지원하지 않는 카드사입니다.");
            }
            if (instMm > Integer.parseInt(maxMm)) {
                throw new BizException("무이자 할부는 최대 " + maxMm + "개월까지 가능합니다.");
            }
        } else if (instMm > 12) {
            throw new BizException("할부는 최대 12개월까지 가능합니다.");
        }
    }

    /**
     * 전체취소.
     * - 가상계좌 입금대기(W): PG 호출 없이 상태만 C
     * - 포인트전액(PNT): PG 호출 없음
     * - 그 외: PG 취소. 부분취소 이력이 있으면 잔액 부분취소로 보낸다.
     */
    @Override
    @Transactional
    public void cancelAll(String ordNo, String rsn) {
        Map<String, Object> pay = lockPayByOrdNo(ordNo);
        String payNo = CmmUtil.str(pay, "PAY_NO");
        String payStat = CmmUtil.str(pay, "PAY_STAT");
        String payMthd = CmmUtil.str(pay, "PAY_MTHD");
        long payAmt = CmmUtil.lng(pay, "PAY_AMT");
        long cnclAmt = CmmUtil.lng(pay, "CNCL_AMT");
        long remain = payAmt - cnclAmt;

        if (PAY_STAT_CNCL.equals(payStat)) {
            throw new BizException("이미 취소된 결제입니다.");
        }

        if (PAY_STAT_WAIT.equals(payStat)) {
            // 미입금 가상계좌: 돈이 들어오지 않았으므로 PG 취소 대상 아님
            log.info("가상계좌 입금대기 취소 ordNo={} payNo={}", ordNo, payNo);
            insertCnclSuccess(payNo, "A", 0L, 0L, rsn, null, null);
            updateStat(payNo, PAY_STAT_CNCL);
            return;
        }

        if (PAY_MTHD_PNT.equals(payMthd) || remain <= 0) {
            insertCnclSuccess(payNo, "A", remain, 0L, rsn, null, null);
            addCnclAmt(payNo, remain);
            updateStat(payNo, PAY_STAT_CNCL);
            return;
        }

        Map<String, Object> res;
        try {
            if (cnclAmt == 0) {
                res = pgClient.cancel(CmmUtil.str(pay, "PG_TID"), remain, rsn);
            } else {
                // 2021.03 부분취소 이력이 있는 건은 PG v2 정책상 잔액 부분취소로 요청
                res = pgClient.partialCancel(CmmUtil.str(pay, "PG_TID"), remain, 0L, rsn);
            }
        } catch (ExtIfException e) {
            payCnclFailService.recordFail(payNo, "A", remain, 0L, rsn, null, e);
            throw e;
        }
        insertCnclSuccess(payNo, "A", remain, 0L, rsn, null, res);
        addCnclAmt(payNo, remain);
        log.info("결제 전체취소 ordNo={} payNo={} amt={}", ordNo, payNo, remain);
    }

    /**
     * 부분취소 (주문 부분취소, 반품완료).
     * 누적 취소금액은 결제금액을 넘을 수 없다.
     */
    @Override
    @Transactional
    public void cancelPart(String ordNo, long cnclAmt, String rsn, String clmNo) {
        if (cnclAmt <= 0) {
            log.info("부분취소 금액 0 - 결제취소 생략 ordNo={} clmNo={}", ordNo, clmNo);
            return;
        }
        Map<String, Object> pay = lockPayByOrdNo(ordNo);
        String payNo = CmmUtil.str(pay, "PAY_NO");
        String payStat = CmmUtil.str(pay, "PAY_STAT");
        String payMthd = CmmUtil.str(pay, "PAY_MTHD");
        long payAmt = CmmUtil.lng(pay, "PAY_AMT");
        long accCnclAmt = CmmUtil.lng(pay, "CNCL_AMT");

        if (PAY_STAT_CNCL.equals(payStat)) {
            throw new BizException("이미 전체취소된 결제입니다.");
        }
        if (PAY_STAT_WAIT.equals(payStat)) {
            throw new BizException("입금대기 중인 가상계좌는 부분취소할 수 없습니다.");
        }
        if (PAY_STAT_FAIL.equals(payStat)) {
            throw new BizException("취소실패 건이 있습니다. 결제관리에서 재처리 후 진행하세요.");
        }
        if (accCnclAmt + cnclAmt > payAmt) {
            throw new BizException("취소금액이 결제금액을 초과합니다. (결제 " + payAmt + ", 기취소 " + accCnclAmt
                    + ", 요청 " + cnclAmt + ")");
        }
        long remain = payAmt - accCnclAmt - cnclAmt;

        if (PAY_MTHD_PNT.equals(payMthd)) {
            insertCnclSuccess(payNo, "P", cnclAmt, remain, rsn, clmNo, null);
            addCnclAmt(payNo, cnclAmt);
            return;
        }

        if (PAY_MTHD_CARD.equals(payMthd) && "Y".equals(CmmUtil.str(pay, "FREE_INST_YN"))) {
            String minAmt = getCardCoVal(CmmUtil.str(pay, "CARD_CO"), "CD_VAL2");
            if (!CmmUtil.isEmpty(minAmt) && remain > 0 && remain < Long.parseLong(minAmt)) {
                // 무이자 할부 최소금액 미만이 되어도 PG 정책상 최초 승인 할부조건 유지
                log.info("무이자할부 잔액 최소금액 미만 - 할부 유지 payNo={} remain={} min={}", payNo, remain, minAmt);
            }
        }

        Map<String, Object> res;
        try {
            res = pgClient.partialCancel(CmmUtil.str(pay, "PG_TID"), cnclAmt, remain, rsn);
        } catch (ExtIfException e) {
            payCnclFailService.recordFail(payNo, "P", cnclAmt, remain, rsn, clmNo, e);
            throw e;
        }
        insertCnclSuccess(payNo, "P", cnclAmt, remain, rsn, clmNo, res);
        addCnclAmt(payNo, cnclAmt);
        log.info("결제 부분취소 ordNo={} payNo={} amt={} remain={} clmNo={}", ordNo, payNo, cnclAmt, remain, clmNo);
    }

    /**
     * 취소실패(E) 재처리. 마지막 실패 이력의 금액으로 다시 PG 취소를 요청한다.
     */
    @Override
    @Transactional
    public void retryCancel(String payNo, String chgId) {
        Map<String, Object> pay = payMapper.selectPayForUpdate(payNo);
        if (pay == null) {
            throw new BizException("결제정보를 찾을 수 없습니다: " + payNo);
        }
        if (!PAY_STAT_FAIL.equals(CmmUtil.str(pay, "PAY_STAT"))) {
            throw new BizException("취소실패 상태의 결제만 재처리할 수 있습니다.");
        }
        Map<String, Object> fail = payMapper.selectLastFailCncl(payNo);
        if (fail == null) {
            throw new BizException("재처리할 취소실패 이력이 없습니다.");
        }
        int cnclSeq = CmmUtil.intg(fail, "CNCL_SEQ");
        if (CmmUtil.intg(fail, "RETRY_CNT") >= 5) {
            throw new BizException("재처리 횟수(5회)를 초과했습니다. PG사 확인 후 수기 처리하세요.");
        }
        long amt = CmmUtil.lng(fail, "CNCL_AMT");
        long remain = CmmUtil.lng(fail, "REMAIN_AMT");
        long accCnclAmt = CmmUtil.lng(pay, "CNCL_AMT");
        String pgTid = CmmUtil.str(pay, "PG_TID");
        String rsn = CmmUtil.str(fail, "CNCL_RSN");

        Map<String, Object> res;
        try {
            if ("A".equals(CmmUtil.str(fail, "CNCL_TYPE")) && accCnclAmt == 0) {
                res = pgClient.cancel(pgTid, amt, rsn);
            } else {
                res = pgClient.partialCancel(pgTid, amt, remain, rsn);
            }
        } catch (ExtIfException e) {
            payCnclFailService.recordRetryFail(payNo, cnclSeq, e);
            throw e;
        }

        Map<String, Object> p = new HashMap<>();
        p.put("PAY_NO", payNo);
        p.put("CNCL_SEQ", cnclSeq);
        p.put("CNCL_STAT", "R");
        p.put("PG_CNCL_TID", res.get("PG_CNCL_TID"));
        p.put("PG_RES_CD", res.get("RES_CD"));
        p.put("PG_RES_MSG", res.get("RES_MSG"));
        payMapper.updateCnclRetry(p);
        addCnclAmt(payNo, amt);
        log.info("취소실패 재처리 완료 payNo={} seq={} amt={} by {}", payNo, cnclSeq, amt, chgId);
    }

    // ------------------------------------------------------------------

    private Map<String, Object> lockPayByOrdNo(String ordNo) {
        Map<String, Object> cur = payMapper.selectPayByOrdNo(ordNo);
        if (cur == null) {
            throw new BizException("결제정보가 없습니다: " + ordNo);
        }
        return payMapper.selectPayForUpdate(CmmUtil.str(cur, "PAY_NO"));
    }

    private void insertCnclSuccess(String payNo, String cnclType, long amt, long remain, String rsn,
                                   String clmNo, Map<String, Object> res) {
        Map<String, Object> cncl = new HashMap<>();
        cncl.put("PAY_NO", payNo);
        cncl.put("CNCL_SEQ", payMapper.selectNextCnclSeq(payNo));
        cncl.put("CNCL_TYPE", cnclType);
        cncl.put("CNCL_AMT", amt);
        cncl.put("REMAIN_AMT", remain);
        cncl.put("CNCL_RSN", rsn);
        cncl.put("CLM_NO", clmNo);
        cncl.put("CNCL_STAT", "S");
        if (res != null) {
            cncl.put("PG_CNCL_TID", res.get("PG_CNCL_TID"));
            cncl.put("PG_RES_CD", res.get("RES_CD"));
            cncl.put("PG_RES_MSG", res.get("RES_MSG"));
        }
        payMapper.insertPayCncl(cncl);
    }

    private void addCnclAmt(String payNo, long amt) {
        Map<String, Object> p = new HashMap<>();
        p.put("PAY_NO", payNo);
        p.put("ADD_CNCL_AMT", amt);
        payMapper.updatePayCnclAmt(p);
    }

    private void updateStat(String payNo, String payStat) {
        Map<String, Object> p = new HashMap<>();
        p.put("PAY_NO", payNo);
        p.put("PAY_STAT", payStat);
        payMapper.updatePayStat(p);
    }

    /** 카드사 코드 기준값. CD_VAL1 무이자 최대개월, CD_VAL2 무이자 최소금액 */
    private String getCardCoVal(String cardCo, String col) {
        if ("CD_VAL1".equals(col)) {
            return cmmCodeService.getCodeVal("CARD_CO", cardCo);
        }
        Map<String, Object> param = new HashMap<>();
        param.put("GRP_CD", "CARD_CO");
        param.put("USE_YN", "Y");
        for (Map<String, Object> row : cmmCodeService.getCodeList(param)) {
            if (cardCo.equals(CmmUtil.str(row, "CD"))) {
                return CmmUtil.str(row, col);
            }
        }
        return null;
    }
}
