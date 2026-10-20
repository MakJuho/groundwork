package com.example.commerce.ord;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.annotation.ParamVariable;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/ord")
public class OrdController {

    private final OrdService ordService;

    public OrdController(OrdService ordService) {
        this.ordService = ordService;
    }

    @RequestMapping("/selectOrdList.do")
    public NexacroResult selectOrdList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_ord", ordService.list(search));
        result.addVariable("TOT_CNT", ordService.listCnt(search));
        return result;
    }

    @SuppressWarnings("unchecked")
    @RequestMapping("/selectOrdDetail.do")
    public NexacroResult selectOrdDetail(@ParamVariable(name = "ORD_NO") String ordNo) {
        if (CmmUtil.isEmpty(ordNo)) {
            throw new BizException("주문번호가 없습니다.");
        }
        Map<String, Object> detail = ordService.detail(ordNo);
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_ord", Collections.singletonList(detail.get("ORD")));
        result.addDataSet("ds_item", (List<Map<String, Object>>) detail.get("ITEM"));
        result.addDataSet("ds_pay", toRows((Map<String, Object>) detail.get("PAY")));
        result.addDataSet("ds_dlv", toRows((Map<String, Object>) detail.get("DLV")));
        result.addDataSet("ds_hist", (List<Map<String, Object>>) detail.get("HIST"));
        return result;
    }

    @RequestMapping("/prepareOrd.do")
    public NexacroResult prepareOrd(@ParamDataSet(name = "ds_prepare") List<Map<String, Object>> rows,
                                    @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("PROC_CNT", ordService.prepareOrd(rows, userId));
        return result;
    }

    @RequestMapping("/cancelOrd.do")
    public NexacroResult cancelOrd(@ParamDataSet(name = "ds_cancel") Map<String, Object> cancel,
                                   @ParamVariable(name = "USER_ID") String userId) {
        ordService.cancelOrd(CmmUtil.str(cancel, "ORD_NO"), CmmUtil.str(cancel, "CNCL_RSN"), userId);
        return new NexacroResult();
    }

    @RequestMapping("/partCancelOrd.do")
    public NexacroResult partCancelOrd(@ParamDataSet(name = "ds_partCancel") List<Map<String, Object>> items,
                                       @ParamVariable(name = "ORD_NO") String ordNo,
                                       @ParamVariable(name = "CNCL_RSN") String rsn,
                                       @ParamVariable(name = "USER_ID") String userId) {
        Map<String, Object> res = ordService.partCancelOrd(ordNo, items, rsn, userId);
        NexacroResult result = new NexacroResult();
        result.addVariable("REFUND_AMT", res.get("REFUND_AMT"));
        result.addVariable("ALL_CNCL_YN", res.get("ALL_CNCL_YN"));
        return result;
    }

    @RequestMapping("/confirmPurchase.do")
    public NexacroResult confirmPurchase(@ParamDataSet(name = "ds_confirm") List<Map<String, Object>> rows,
                                         @ParamVariable(name = "USER_ID") String userId) {
        NexacroResult result = new NexacroResult();
        result.addVariable("PROC_CNT", ordService.confirmPurchaseList(rows, userId));
        return result;
    }

    private List<Map<String, Object>> toRows(Map<String, Object> row) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (row != null) {
            list.add(row);
        }
        return list;
    }
}
