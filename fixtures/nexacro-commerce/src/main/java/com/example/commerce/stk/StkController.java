package com.example.commerce.stk;

import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/stk")
public class StkController {

    private final StkService stkService;

    public StkController(StkService stkService) {
        this.stkService = stkService;
    }

    @RequestMapping("/selectStkList.do")
    public NexacroResult selectStkList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_stk", stkService.selectStkList(search));
        return result;
    }

    @RequestMapping("/adjustStk.do")
    public NexacroResult adjustStk(@ParamDataSet(name = "ds_adj") List<Map<String, Object>> list,
                                   @ParamVariable(name = "USER_ID") String userId) {
        int cnt = stkService.adjustList(list, CmmUtil.isEmpty(userId) ? "ADMIN" : userId);
        Map<String, Object> row = new HashMap<>();
        row.put("RESULT_CNT", cnt);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_result", List.of(row));
        return result;
    }
}
