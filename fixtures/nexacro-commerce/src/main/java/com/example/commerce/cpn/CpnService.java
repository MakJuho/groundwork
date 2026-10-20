package com.example.commerce.cpn;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.mbr.MbrService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 쿠폰 정책/발급/사용.
 * 주문(ord)에서 calcDc → use, 취소·반품에서 restore 를 호출한다.
 */
@Service
public class CpnService {

    private static final Logger log = LoggerFactory.getLogger(CpnService.class);

    static final String TYPE_AMT = "AMT";
    static final String TYPE_RATE = "RATE";

    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final CpnMapper cpnMapper;
    private final SeqService seqService;
    private final MbrService mbrService;

    public CpnService(CpnMapper cpnMapper, SeqService seqService, MbrService mbrService) {
        this.cpnMapper = cpnMapper;
        this.seqService = seqService;
        this.mbrService = mbrService;
    }

    public List<Map<String, Object>> selectCpnList(Map<String, Object> search) {
        return cpnMapper.selectCpnList(search);
    }

    public List<Map<String, Object>> selectIssueList(Map<String, Object> search) {
        return cpnMapper.selectIssueList(search);
    }

    /** 쿠폰 정책 저장. 화면 검사와 동일한 기준으로 서버에서도 다시 본다. */
    @Transactional
    public int saveCpnList(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String rowType = CmmUtil.str(row, "_RowType_");
            row.put("USER_ID", userId);
            if ("D".equals(rowType)) {
                // 2020.08 발급 이력 보존을 위해 삭제 대신 사용중지 처리
                cnt += cpnMapper.updateCpnUseN(row);
                continue;
            }
            validateCpn(row);
            if ("I".equals(rowType)) {
                if (CmmUtil.isEmpty(CmmUtil.str(row, "CPN_ID"))) {
                    row.put("CPN_ID", seqService.next("CPN"));
                }
                cnt += cpnMapper.insertCpn(row);
            } else {
                cnt += cpnMapper.updateCpn(row);
            }
        }
        return cnt;
    }

    private void validateCpn(Map<String, Object> row) {
        String cpnNm = CmmUtil.str(row, "CPN_NM");
        String cpnType = CmmUtil.str(row, "CPN_TYPE");
        long dcVal = CmmUtil.lng(row, "DC_VAL");
        if (CmmUtil.isEmpty(cpnNm)) {
            throw new BizException("쿠폰명은 필수입니다.");
        }
        if (!TYPE_AMT.equals(cpnType) && !TYPE_RATE.equals(cpnType)) {
            throw new BizException("쿠폰유형이 올바르지 않습니다. [" + cpnNm + "]");
        }
        if (dcVal <= 0) {
            throw new BizException("할인값은 0보다 커야 합니다. [" + cpnNm + "]");
        }
        if (TYPE_RATE.equals(cpnType)) {
            if (dcVal < 1 || dcVal > 90) {
                throw new BizException("정률 쿠폰의 할인율은 1~90% 사이여야 합니다. [" + cpnNm + "]");
            }
            if (CmmUtil.lng(row, "MAX_DC_AMT") <= 0) {
                throw new BizException("정률 쿠폰은 최대할인액을 입력해야 합니다. [" + cpnNm + "]");
            }
        }
        if (CmmUtil.intg(row, "VALID_DAYS") <= 0) {
            throw new BizException("유효기간(일)은 1일 이상이어야 합니다. [" + cpnNm + "]");
        }
        if (CmmUtil.lng(row, "MIN_ORD_AMT") < 0 || CmmUtil.lng(row, "ISSUE_LMT_CNT") < 0) {
            throw new BizException("최소주문금액/발급한도는 음수일 수 없습니다. [" + cpnNm + "]");
        }
    }

    /** 수동 발급 (관리자 화면) */
    @Transactional
    public int issueList(String cpnId, List<Map<String, Object>> targetList, String userId) {
        if (CmmUtil.isEmpty(cpnId)) {
            throw new BizException("발급할 쿠폰을 선택하세요.");
        }
        if (targetList == null || targetList.isEmpty()) {
            throw new BizException("발급 대상 회원이 없습니다.");
        }
        int cnt = 0;
        for (Map<String, Object> target : targetList) {
            issue(cpnId, CmmUtil.str(target, "MBR_ID"), userId);
            cnt++;
        }
        log.info("쿠폰 수동발급 cpnId={} cnt={} by {}", cpnId, cnt, userId);
        return cnt;
    }

    @Transactional
    public String issue(String cpnId, String mbrId, String userId) {
        Map<String, Object> cpn = cpnMapper.selectCpn(cpnId);
        if (cpn == null) {
            throw new BizException("쿠폰 정보가 없습니다: " + cpnId);
        }
        if (!"Y".equals(CmmUtil.str(cpn, "USE_YN"))) {
            throw new BizException("사용 중지된 쿠폰입니다: " + CmmUtil.str(cpn, "CPN_NM"));
        }
        String today = CmmUtil.today();
        String strtDt = CmmUtil.str(cpn, "ISSUE_STRT_DT");
        String endDt = CmmUtil.str(cpn, "ISSUE_END_DT");
        if ((!CmmUtil.isEmpty(strtDt) && today.compareTo(strtDt) < 0)
                || (!CmmUtil.isEmpty(endDt) && today.compareTo(endDt) > 0)) {
            throw new BizException("발급 기간이 아닙니다: " + CmmUtil.str(cpn, "CPN_NM"));
        }
        long lmtCnt = CmmUtil.lng(cpn, "ISSUE_LMT_CNT");
        if (lmtCnt > 0 && CmmUtil.lng(cpn, "ISSUE_CNT") >= lmtCnt) {
            throw new BizException("발급 한도(" + lmtCnt + "장)를 초과했습니다.");
        }

        Map<String, Object> mbr = mbrService.getMbr(mbrId);
        if (!"A".equals(CmmUtil.str(mbr, "MBR_STAT"))) {
            throw new BizException("정상 회원에게만 발급할 수 있습니다: " + mbrId);
        }

        Map<String, Object> param = new HashMap<>();
        param.put("CPN_ID", cpnId);
        param.put("MBR_ID", mbrId);
        if (cpnMapper.selectMbrIssueCnt(param) > 0) {
            throw new BizException("이미 발급받은 쿠폰입니다. 회원: " + mbrId);
        }

        int validDays = CmmUtil.intg(cpn, "VALID_DAYS");
        String issueNo = seqService.next("CPI");
        param.put("ISSUE_NO", issueNo);
        param.put("ISSUE_DT", today);
        param.put("EXP_DT", LocalDate.parse(today, YMD).plusDays(validDays).format(YMD));
        param.put("REG_ID", userId);
        cpnMapper.insertIssue(param);
        cpnMapper.updateIssueCnt(cpnId);
        return issueNo;
    }

    /**
     * 쿠폰 할인액 계산. 주문서 작성 시 호출.
     * @return 할인액(원)
     */
    public long calcDc(String issueNo, String mbrId, long ordAmt) {
        Map<String, Object> issue = cpnMapper.selectIssue(issueNo);
        if (issue == null) {
            throw new BizException("쿠폰 발급 정보가 없습니다: " + issueNo);
        }
        if (!mbrId.equals(CmmUtil.str(issue, "MBR_ID"))) {
            throw new BizException("본인에게 발급된 쿠폰만 사용할 수 있습니다.");
        }
        if ("Y".equals(CmmUtil.str(issue, "USE_YN"))) {
            throw new BizException("이미 사용한 쿠폰입니다.");
        }
        if (CmmUtil.today().compareTo(CmmUtil.str(issue, "EXP_DT")) > 0) {
            throw new BizException("유효기간이 지난 쿠폰입니다.");
        }
        long minOrdAmt = CmmUtil.lng(issue, "MIN_ORD_AMT");
        if (ordAmt < minOrdAmt) {
            throw new BizException("최소 주문금액 " + minOrdAmt + "원 이상부터 사용할 수 있습니다.");
        }

        long dcAmt;
        String cpnType = CmmUtil.str(issue, "CPN_TYPE");
        if (TYPE_AMT.equals(cpnType)) {
            dcAmt = CmmUtil.lng(issue, "DC_VAL");
        } else if (TYPE_RATE.equals(cpnType)) {
            dcAmt = CmmUtil.truncWon((double) ordAmt * CmmUtil.lng(issue, "DC_VAL") / 100);
            long maxDcAmt = CmmUtil.lng(issue, "MAX_DC_AMT");
            if (maxDcAmt > 0 && dcAmt > maxDcAmt) {
                dcAmt = maxDcAmt;
            }
        } else {
            throw new BizException("쿠폰유형이 올바르지 않습니다: " + cpnType);
        }
        //if (dcAmt > ordAmt) {
        //    dcAmt = ordAmt;
        //}
        if (dcAmt > ordAmt) {
            throw new BizException("할인금액이 주문금액을 초과할 수 없습니다.");
        }
        return dcAmt;
    }

    @Transactional
    public void use(String issueNo, String ordNo, long dcAmt) {
        Map<String, Object> param = new HashMap<>();
        param.put("ISSUE_NO", issueNo);
        param.put("ORD_NO", ordNo);
        param.put("DC_AMT", dcAmt);
        int cnt = cpnMapper.updateIssueUse(param);
        if (cnt == 0) {
            throw new BizException("쿠폰을 사용할 수 없습니다. 이미 사용되었거나 없는 쿠폰입니다.");
        }
        log.info("쿠폰 사용 issueNo={} ordNo={} dcAmt={}", issueNo, ordNo, dcAmt);
    }

    /** 주문 취소/전체 반품 시 사용 쿠폰 원복 */
    @Transactional
    public void restore(String ordNo) {
        Map<String, Object> used = cpnMapper.selectUsedIssueByOrd(ordNo);
        if (used == null) {
            return;
        }
        String issueNo = CmmUtil.str(used, "ISSUE_NO");
        // 만료 쿠폰은 복원하지 않는다 (2020.05 CS정책)
        if (CmmUtil.today().compareTo(CmmUtil.str(used, "EXP_DT")) > 0) {
            log.info("만료 쿠폰 복원 생략 ordNo={} issueNo={} expDt={}", ordNo, issueNo, CmmUtil.str(used, "EXP_DT"));
            return;
        }
        cpnMapper.updateIssueRestore(issueNo);
        log.info("쿠폰 복원 ordNo={} issueNo={}", ordNo, issueNo);
    }

    /** 주문에 사용된 쿠폰 (ISSUE_NO, CPN_ID, DC_AMT, EXP_DT). 없으면 null */
    public Map<String, Object> getUsedCpn(String ordNo) {
        return cpnMapper.selectUsedIssueByOrd(ordNo);
    }
}
