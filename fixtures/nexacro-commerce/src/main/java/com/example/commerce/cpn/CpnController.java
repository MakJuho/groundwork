package com.example.commerce.cpn;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/cpn")
public class CpnController {

    private final CpnService cpnService;

    public CpnController(CpnService cpnService) {
        this.cpnService = cpnService;
    }

    @RequestMapping("/selectCpnList.do")
    public NexacroResult selectCpnList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_cpn", cpnService.selectCpnList(search));
        return result;
    }

    @RequestMapping("/saveCpn.do")
    public NexacroResult saveCpn(@ParamDataSet(name = "ds_cpn") List<Map<String, Object>> list,
                                 @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("saveCnt", cpnService.saveCpnList(list, userId));
        return result;
    }

    @RequestMapping("/selectIssueList.do")
    public NexacroResult selectIssueList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_issue", cpnService.selectIssueList(search));
        return result;
    }

    @RequestMapping("/issueCpn.do")
    public NexacroResult issueCpn(@ParamDataSet(name = "ds_target") List<Map<String, Object>> targetList,
                                  @ParamVariable(name = "CPN_ID") String cpnId,
                                  @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("issueCnt", cpnService.issueList(cpnId, targetList, userId));
        return result;
    }
}
