package com.example.commerce.prd;

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
@RequestMapping("/prd")
public class PrdController {

    private final PrdService prdService;

    public PrdController(PrdService prdService) {
        this.prdService = prdService;
    }

    @RequestMapping("/selectPrdList.do")
    public NexacroResult selectPrdList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_prd", prdService.selectPrdList(search));
        return result;
    }

    @RequestMapping("/savePrd.do")
    public NexacroResult savePrd(@ParamDataSet(name = "ds_prd") List<Map<String, Object>> list,
                                 @ParamVariable(name = "USER_ID") String userId) {
        return resultCnt(prdService.savePrdList(list, CmmUtil.isEmpty(userId) ? "ADMIN" : userId));
    }

    @RequestMapping("/selectCtgList.do")
    public NexacroResult selectCtgList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_ctg", prdService.selectCtgList(search));
        return result;
    }

    @RequestMapping("/saveCtg.do")
    public NexacroResult saveCtg(@ParamDataSet(name = "ds_ctg") List<Map<String, Object>> list,
                                 @ParamVariable(name = "USER_ID") String userId) {
        return resultCnt(prdService.saveCtgList(list, CmmUtil.isEmpty(userId) ? "ADMIN" : userId));
    }

    private NexacroResult resultCnt(int cnt) {
        Map<String, Object> row = new HashMap<>();
        row.put("RESULT_CNT", cnt);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_result", List.of(row));
        return result;
    }
}
