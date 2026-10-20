package com.example.commerce.stl;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/stl")
public class StlController {

    private final StlService stlService;

    public StlController(StlService stlService) {
        this.stlService = stlService;
    }

    /** 정산 목록 + 합계 */
    @RequestMapping("/selectStlList.do")
    public NexacroResult selectStlList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        if (CmmUtil.isEmpty(CmmUtil.str(search, "FROM_YMD")) || CmmUtil.isEmpty(CmmUtil.str(search, "TO_YMD"))) {
            throw new BizException("조회 기간을 입력하세요.");
        }
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_stl", stlService.selectStlList(search));
        result.addDataSet("ds_stlSum", stlService.selectStlSum(search));
        result.addVariable("totCnt", stlService.selectStlListCnt(search));
        return result;
    }

    /** 판매자별 지급 집계 / 지급 상세 */
    @RequestMapping("/selectStlDetail.do")
    public NexacroResult selectStlDetail(@ParamDataSet(name = "ds_search") Map<String, Object> search,
                                         @ParamVariable(name = "DETAIL_YN", required = false) String detailYn) {
        NexacroResult result = new NexacroResult();
        if ("Y".equals(detailYn)) {
            result.addDataSet("ds_stlPayItem", stlService.selectStlPayItemList(search));
        } else {
            result.addDataSet("ds_stlPay", stlService.selectStlPayList(search));
        }
        return result;
    }

    @RequestMapping("/holdStl.do")
    public NexacroResult holdStl(@ParamDataSet(name = "ds_stl") List<Map<String, Object>> list,
                                 @ParamVariable(name = "HOLD_RSN") String holdRsn,
                                 HttpSession session) {
        NexacroResult result = new NexacroResult();
        result.addVariable("procCnt", stlService.holdStl(checked(list), holdRsn, userId(session)));
        return result;
    }

    @RequestMapping("/releaseHold.do")
    public NexacroResult releaseHold(@ParamDataSet(name = "ds_stl") List<Map<String, Object>> list,
                                     HttpSession session) {
        NexacroResult result = new NexacroResult();
        result.addVariable("procCnt", stlService.releaseHold(checked(list), userId(session)));
        return result;
    }

    @RequestMapping("/confirmStl.do")
    public NexacroResult confirmStl(@ParamDataSet(name = "ds_stl") List<Map<String, Object>> list,
                                    @ParamVariable(name = "CNFM_RSN") String cnfmRsn,
                                    HttpSession session) {
        NexacroResult result = new NexacroResult();
        result.addVariable("procCnt", stlService.confirmStl(checked(list), cnfmRsn, userId(session)));
        return result;
    }

    private List<Map<String, Object>> checked(List<Map<String, Object>> list) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (list != null) {
            for (Map<String, Object> row : list) {
                if ("1".equals(CmmUtil.str(row, "CHK")) || "Y".equals(CmmUtil.str(row, "CHK"))) {
                    rows.add(row);
                }
            }
        }
        if (rows.isEmpty()) {
            throw new BizException("처리할 정산 건을 선택하세요.");
        }
        return rows;
    }

    private String userId(HttpSession session) {
        Object v = session == null ? null : session.getAttribute("USER_ID");
        return v == null ? "ADMIN" : String.valueOf(v);
    }
}
