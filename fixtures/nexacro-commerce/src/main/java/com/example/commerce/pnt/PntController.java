package com.example.commerce.pnt;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/pnt")
public class PntController {

    private final PntService pntService;

    public PntController(PntService pntService) {
        this.pntService = pntService;
    }

    @RequestMapping("/selectPntList.do")
    public NexacroResult selectPntList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_ledger", pntService.selectLedgerList(search));
        result.addDataSet("ds_bal", pntService.selectBalInfo(search));
        return result;
    }

    @RequestMapping("/adjustPnt.do")
    public NexacroResult adjustPnt(@ParamDataSet(name = "ds_adjust") Map<String, Object> adjust,
                                   @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("BAL_AMT", pntService.adjust(adjust, userId));
        return result;
    }
}
