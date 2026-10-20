package com.example.shop.member;

import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/member")
public class MemberController {

    private final MemberService memberService;

    public MemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @RequestMapping("/list.do")
    public NexacroResult list(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_member", memberService.findMembers(search));
        return result;
    }

    @RequestMapping("/save.do")
    public NexacroResult save(@ParamDataSet(name = "ds_member") List<MemberDto> members) {
        int count = memberService.saveMembers(members);
        Map<String, Object> row = new HashMap<>();
        row.put("RESULT_CNT", count);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_result", List.of(row));
        return result;
    }
}
