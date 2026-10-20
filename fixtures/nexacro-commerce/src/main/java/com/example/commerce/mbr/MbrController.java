package com.example.commerce.mbr;

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
@RequestMapping("/mbr")
public class MbrController {

    private final MbrService mbrService;

    public MbrController(MbrService mbrService) {
        this.mbrService = mbrService;
    }

    @RequestMapping("/selectMbrList.do")
    public NexacroResult selectMbrList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_mbr", mbrService.selectMbrList(search));
        return result;
    }

    @RequestMapping("/saveMbr.do")
    public NexacroResult saveMbr(@ParamDataSet(name = "ds_mbr") List<Map<String, Object>> list,
                                 @ParamVariable(name = "USER_ID") String userId) {
        int cnt = mbrService.saveMbrList(list, nvlUser(userId));
        Map<String, Object> row = new HashMap<>();
        row.put("RESULT_CNT", cnt);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_result", List.of(row));
        return result;
    }

    @RequestMapping("/selectGradeHist.do")
    public NexacroResult selectGradeHist(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_hist", mbrService.selectGradeHist(search));
        return result;
    }

    @RequestMapping("/changeGrade.do")
    public NexacroResult changeGrade(@ParamDataSet(name = "ds_grade") Map<String, Object> param,
                                     @ParamVariable(name = "USER_ID") String userId) {
        mbrService.changeGrade(param, nvlUser(userId));
        return new NexacroResult();
    }

    private String nvlUser(String userId) {
        // 세션 연동 전까지 화면에서 넘긴 사용자ID 사용
        return CmmUtil.isEmpty(userId) ? "ADMIN" : userId;
    }
}
