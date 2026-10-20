package com.example.commerce.cmm;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/cmm")
public class CmmCodeController {

    private final CmmCodeService cmmCodeService;

    public CmmCodeController(CmmCodeService cmmCodeService) {
        this.cmmCodeService = cmmCodeService;
    }

    @RequestMapping("/selectCodeList.do")
    public NexacroResult selectCodeList(@ParamDataSet(name = "ds_search", required = false) Map<String, Object> search,
                                        @ParamVariable(name = "GRP_CD", required = false) String grpCd,
                                        @ParamVariable(name = "USE_YN", required = false) String useYn) {
        // 콤보용 코드 조회(gfn_setCode)는 Dataset 없이 변수로 넘어온다
        if (search == null) {
            search = new HashMap<>();
            search.put("GRP_CD", grpCd);
            search.put("USE_YN", useYn);
        }
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_code", cmmCodeService.getCodeList(search));
        return result;
    }

    @RequestMapping("/saveCode.do")
    public NexacroResult saveCode(@ParamDataSet(name = "ds_code") List<Map<String, Object>> list) {
        NexacroResult result = new NexacroResult();
        result.addVariable("saveCnt", cmmCodeService.saveCodeList(list));
        return result;
    }
}
