package com.example.commerce.clm;

import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/clm")
public class ClmController {

    private final ClmService clmService;

    public ClmController(ClmService clmService) {
        this.clmService = clmService;
    }

    @RequestMapping("/selectClmList.do")
    public NexacroResult selectClmList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_clm", clmService.selectClmList(search));
        return result;
    }

    @RequestMapping("/selectClmDetail.do")
    public NexacroResult selectClmDetail(@ParamVariable(name = "CLM_NO", required = false) String clmNo,
                                         @ParamVariable(name = "ORD_NO", required = false) String ordNo) {
        NexacroResult result = new NexacroResult();
        Map<String, List<Map<String, Object>>> detail = clmService.selectClmDetail(clmNo, ordNo);
        for (Map.Entry<String, List<Map<String, Object>>> entry : detail.entrySet()) {
            result.addDataSet(entry.getKey(), entry.getValue());
        }
        return result;
    }

    @RequestMapping("/requestReturn.do")
    public NexacroResult requestReturn(@ParamDataSet(name = "ds_rtnReq") Map<String, Object> clm,
                                       @ParamDataSet(name = "ds_rtnItem") List<Map<String, Object>> itemList,
                                       @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("CLM_NO", clmService.requestReturn(clm, itemList, userId));
        return result;
    }

    @RequestMapping("/completeReturn.do")
    public NexacroResult completeReturn(@ParamDataSet(name = "ds_proc") Map<String, Object> proc,
                                        @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("REFUND_AMT", clmService.completeReturn(CmmUtil.str(proc, "CLM_NO"), userId));
        return result;
    }

    @RequestMapping("/rejectClm.do")
    public NexacroResult rejectClm(@ParamDataSet(name = "ds_proc") Map<String, Object> proc,
                                   @ParamVariable(name = "USER_ID") String userId) {
        clmService.rejectClm(CmmUtil.str(proc, "CLM_NO"), CmmUtil.str(proc, "REJ_RSN"), userId);
        return new NexacroResult();
    }
}
