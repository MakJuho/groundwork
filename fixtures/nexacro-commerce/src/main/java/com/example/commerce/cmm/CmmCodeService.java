package com.example.commerce.cmm;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공통코드. 업무 기준값(적립률, 반품비 등)도 코드의 CD_VAL1에 들어 있다. */
@Service
public class CmmCodeService {

    private final CmmCodeMapper cmmCodeMapper;

    public CmmCodeService(CmmCodeMapper cmmCodeMapper) {
        this.cmmCodeMapper = cmmCodeMapper;
    }

    public List<Map<String, Object>> getCodeList(Map<String, Object> param) {
        return cmmCodeMapper.selectCodeList(param);
    }

    /** 코드 그룹/코드의 기준값(CD_VAL1). 없으면 null. */
    public String getCodeVal(String grpCd, String cd) {
        Map<String, Object> param = new HashMap<>();
        param.put("GRP_CD", grpCd);
        param.put("CD", cd);
        return cmmCodeMapper.selectCodeVal(param);
    }

    @Transactional
    public int saveCodeList(List<Map<String, Object>> list) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String rowType = CmmUtil.str(row, "_RowType_");
            if ("D".equals(rowType)) {
                cnt += cmmCodeMapper.deleteCode(row);
                continue;
            }
            if (CmmUtil.isEmpty(CmmUtil.str(row, "GRP_CD")) || CmmUtil.isEmpty(CmmUtil.str(row, "CD"))) {
                throw new BizException("코드그룹과 코드는 필수입니다.");
            }
            cnt += cmmCodeMapper.mergeCode(row);
        }
        return cnt;
    }
}
