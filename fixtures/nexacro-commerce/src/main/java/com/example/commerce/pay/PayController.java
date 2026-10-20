package com.example.commerce.pay;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.Collections;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/pay")
public class PayController {

    private final PayService payService;

    public PayController(PayService payService) {
        this.payService = payService;
    }

    @RequestMapping("/selectPayList.do")
    public NexacroResult selectPayList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_pay", payService.selectPayList(search));
        result.addVariable("TOT_CNT", payService.selectPayListCnt(search));
        return result;
    }

    @RequestMapping("/selectPayDetail.do")
    public NexacroResult selectPayDetail(@ParamVariable(name = "PAY_NO") String payNo) {
        if (CmmUtil.isEmpty(payNo)) {
            throw new BizException("결제번호가 없습니다.");
        }
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_payInfo", Collections.singletonList(payService.selectPayDetail(payNo)));
        result.addDataSet("ds_cncl", payService.selectCnclList(payNo));
        return result;
    }

    @RequestMapping("/retryCancel.do")
    public NexacroResult retryCancel(@ParamDataSet(name = "ds_retry") Map<String, Object> retry,
                                     @ParamVariable(name = "USER_ID") String userId) {
        payService.retryCancel(CmmUtil.str(retry, "PAY_NO"), userId);
        return new NexacroResult();
    }
}
