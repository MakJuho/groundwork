package com.example.commerce.mbr;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service("mbrService")
public class MbrServiceImpl implements MbrService {

    private static final Logger log = LoggerFactory.getLogger(MbrServiceImpl.class);

    /** 휴대폰번호 형식 (010-1234-5678, 01012345678 모두 허용) */
    private static final Pattern HP_PATTERN = Pattern.compile("^01[016789]-?\\d{3,4}-?\\d{4}$");

    private final MbrMapper mbrMapper;
    private final CmmCodeService cmmCodeService;
    private final SeqService seqService;

    public MbrServiceImpl(MbrMapper mbrMapper, CmmCodeService cmmCodeService, SeqService seqService) {
        this.mbrMapper = mbrMapper;
        this.cmmCodeService = cmmCodeService;
        this.seqService = seqService;
    }

    @Override
    public List<Map<String, Object>> selectMbrList(Map<String, Object> search) {
        // 2021.02 운영요청 #2034 휴대폰번호 검색 시 하이픈 제거 후 비교
        String hpNo = CmmUtil.str(search, "HP_NO");
        if (!CmmUtil.isEmpty(hpNo)) {
            search.put("HP_NO", hpNo.replaceAll("-", ""));
        }
        if (CmmUtil.intg(search, "PAGE_NO") <= 0) {
            search.put("PAGE_NO", 1);
        }
        if (CmmUtil.intg(search, "PAGE_SIZE") <= 0) {
            search.put("PAGE_SIZE", 100);
        }
        return mbrMapper.selectMbrList(search);
    }

    @Override
    @Transactional
    public int saveMbrList(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String rowType = CmmUtil.str(row, "_RowType_");
            row.put("USER_ID", userId);

            if ("D".equals(rowType)) {
                // 회원은 물리 삭제하지 않는다. 탈퇴(W) 처리로 대체
                throw new BizException("회원은 삭제할 수 없습니다. 상태를 탈퇴로 변경하세요.");
            }

            validateMbr(row);

            if ("I".equals(rowType)) {
                if (CmmUtil.isEmpty(CmmUtil.str(row, "MBR_ID"))) {
                    row.put("MBR_ID", seqService.next("MBR"));
                }
                // 신규 회원은 일반 등급, 정상 상태로 시작
                row.put("GRADE_CD", "GEN");
                if (CmmUtil.isEmpty(CmmUtil.str(row, "MBR_STAT"))) {
                    row.put("MBR_STAT", "A");
                }
                cnt += mbrMapper.insertMbr(row);
                log.info("[MBR] 회원 등록 {} by {}", row.get("MBR_ID"), userId);
            } else if ("U".equals(rowType)) {
                Map<String, Object> org = mbrMapper.selectMbr(CmmUtil.str(row, "MBR_ID"));
                if (org == null) {
                    throw new BizException("회원 정보가 없습니다: " + CmmUtil.str(row, "MBR_ID"));
                }
                if ("W".equals(CmmUtil.str(org, "MBR_STAT"))) {
                    throw new BizException("탈퇴한 회원은 수정할 수 없습니다: " + CmmUtil.str(row, "MBR_ID"));
                }
                // 등급은 회원저장으로 바꾸지 않는다 (등급변경 화면에서 사유와 함께 처리)
                row.remove("GRADE_CD");
                cnt += mbrMapper.updateMbr(row);
            }
        }
        return cnt;
    }

    /** 회원 필수값/휴대폰번호 검사. 화면 fn_validate 와 동일 기준 */
    private void validateMbr(Map<String, Object> row) {
        if (CmmUtil.isEmpty(CmmUtil.str(row, "MBR_NM"))) {
            throw new BizException("회원명은 필수입니다.");
        }
        String hpNo = CmmUtil.str(row, "HP_NO");
        if (CmmUtil.isEmpty(hpNo)) {
            throw new BizException("휴대폰번호는 필수입니다.");
        }
        if (!HP_PATTERN.matcher(hpNo).matches()) {
            throw new BizException("휴대폰번호 형식이 올바르지 않습니다: " + hpNo);
        }
        // 저장은 하이픈 없이
        row.put("HP_NO", hpNo.replaceAll("-", ""));

        Map<String, Object> param = new HashMap<>();
        param.put("HP_NO", row.get("HP_NO"));
        param.put("MBR_ID", CmmUtil.str(row, "MBR_ID"));
        if (mbrMapper.countHpNo(param) > 0) {
            throw new BizException("이미 등록된 휴대폰번호입니다: " + hpNo);
        }
    }

    @Override
    public Map<String, Object> getMbr(String mbrId) {
        Map<String, Object> mbr = mbrMapper.selectMbr(mbrId);
        if (mbr == null) {
            throw new BizException("MBR001", "회원 정보가 없습니다: " + mbrId);
        }
        return mbr;
    }

    @Override
    public String getGradeCd(String mbrId) {
        Map<String, Object> mbr = getMbr(mbrId);
        String gradeCd = CmmUtil.str(mbr, "GRADE_CD");
        // 등급 누락 데이터(2019 이관분) 대비
        return CmmUtil.isEmpty(gradeCd) ? "GEN" : gradeCd;
    }

    @Override
    public List<Map<String, Object>> selectGradeHist(Map<String, Object> search) {
        return mbrMapper.selectGradeHist(search);
    }

    @Override
    @Transactional
    public void changeGrade(Map<String, Object> param, String userId) {
        String mbrId = CmmUtil.str(param, "MBR_ID");
        String afGradeCd = CmmUtil.str(param, "AF_GRADE_CD");
        String chgRsn = CmmUtil.str(param, "CHG_RSN");

        if (CmmUtil.isEmpty(mbrId) || CmmUtil.isEmpty(afGradeCd)) {
            throw new BizException("회원과 변경 등급은 필수입니다.");
        }
        // 2020.11.03 운영요청 #1182 반영 - 수동 변경은 사유 필수
        if (CmmUtil.isEmpty(chgRsn)) {
            throw new BizException("등급 변경 사유를 입력하세요.");
        }
        if (chgRsn.length() > 300) {
            throw new BizException("변경 사유는 300자 이내로 입력하세요.");
        }

        Map<String, Object> mbr = getMbr(mbrId);
        String mbrStat = CmmUtil.str(mbr, "MBR_STAT");
        if ("W".equals(mbrStat)) {
            throw new BizException("탈퇴한 회원은 등급을 변경할 수 없습니다.");
        }
        String bfGradeCd = CmmUtil.str(mbr, "GRADE_CD");
        if (afGradeCd.equals(bfGradeCd)) {
            throw new BizException("현재 등급과 같습니다.");
        }
        if (cmmCodeService.getCodeVal("MBR_GRADE", afGradeCd) == null) {
            throw new BizException("사용할 수 없는 등급입니다: " + afGradeCd);
        }

        long cnfmAmt = getCnfmAmt6m(mbrId);

        // 2021.07 정책변경 - VIP 수동 부여는 직전 6개월 구매확정 금액이 골드 기준 이상인 회원만
        if ("VIP".equals(afGradeCd)) {
            long gldBase = Long.parseLong(cmmCodeService.getCodeVal("MBR_GRADE", "GLD"));
            if (cnfmAmt < gldBase) {
                throw new BizException("VIP 수동 부여 기준 미달입니다. (직전 6개월 구매확정 "
                        + cnfmAmt + "원 / 기준 " + gldBase + "원)");
            }
        }
        // if ("VIP".equals(afGradeCd) && !"GLD".equals(bfGradeCd)) {
        //     throw new BizException("VIP는 골드 회원만 부여할 수 있습니다.");
        // }

        Map<String, Object> upd = new HashMap<>();
        upd.put("MBR_ID", mbrId);
        upd.put("GRADE_CD", afGradeCd);
        upd.put("USER_ID", userId);
        mbrMapper.updateGrade(upd);

        Map<String, Object> hist = new HashMap<>();
        hist.put("MBR_ID", mbrId);
        hist.put("BF_GRADE_CD", bfGradeCd);
        hist.put("AF_GRADE_CD", afGradeCd);
        hist.put("CHG_TYPE", "M");
        hist.put("CNFM_AMT_6M", cnfmAmt);
        hist.put("CHG_RSN", chgRsn);
        hist.put("CHG_ID", userId);
        mbrMapper.insertGradeHist(hist);

        log.info("[MBR] 등급 수동변경 {} {} -> {} ({}) by {}", mbrId, bfGradeCd, afGradeCd, chgRsn, userId);
    }

    @Override
    public long getCnfmAmt6m(String mbrId) {
        Long amt = mbrMapper.selectCnfmAmt6m(mbrId);
        return amt == null ? 0L : amt;
    }
}
