package com.example.commerce.dlv;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.nexacro.uiadapter.spring.core.annotation.ParamDataSet;
import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.annotation.Resource;
import javax.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
@RequestMapping("/dlv")
public class DlvController {

    private static final Logger log = LoggerFactory.getLogger(DlvController.class);

    @Resource(name = "dlvService")
    private DlvService dlvService;

    @RequestMapping("/selectDlvList.do")
    public NexacroResult selectDlvList(@ParamDataSet(name = "ds_search") Map<String, Object> search) {
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_dlv", dlvService.selectDlvList(search));
        return result;
    }

    /** 출고 (체크된 행) */
    @RequestMapping("/shipDlv.do")
    public NexacroResult shipDlv(@ParamDataSet(name = "ds_dlv") List<Map<String, Object>> list, HttpSession session) {
        List<Map<String, Object>> rows = checked(list);
        if (rows.isEmpty()) {
            throw new BizException("출고할 배송 건을 선택하세요.");
        }
        NexacroResult result = new NexacroResult();
        result.addVariable("procCnt", dlvService.shipDlv(rows, userId(session)));
        return result;
    }

    /** 배송완료 (관리자 수동) */
    @RequestMapping("/completeDlv.do")
    public NexacroResult completeDlv(@ParamDataSet(name = "ds_dlv") List<Map<String, Object>> list, HttpSession session) {
        List<Map<String, Object>> rows = checked(list);
        if (rows.isEmpty()) {
            throw new BizException("배송완료 처리할 배송 건을 선택하세요.");
        }
        String userId = userId(session);
        int cnt = 0;
        for (Map<String, Object> row : rows) {
            dlvService.completeDlv(CmmUtil.str(row, "DLV_NO"), userId);
            cnt++;
        }
        log.info("completeDlv manual cnt={} userId={}", cnt, userId);
        NexacroResult result = new NexacroResult();
        result.addVariable("procCnt", cnt);
        return result;
    }

    /** 배송조회 */
    @RequestMapping("/trackDlv.do")
    public NexacroResult trackDlv(@ParamDataSet(name = "ds_dlv") Map<String, Object> dlv) {
        String dlvNo = CmmUtil.str(dlv, "DLV_NO");
        if (CmmUtil.isEmpty(dlvNo)) {
            throw new BizException("조회할 배송 건을 선택하세요.");
        }
        NexacroResult result = new NexacroResult();
        result.addDataSet("ds_trace", dlvService.trackDlv(dlvNo));
        return result;
    }

    private List<Map<String, Object>> checked(List<Map<String, Object>> list) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (list == null) {
            return rows;
        }
        for (Map<String, Object> row : list) {
            if ("1".equals(CmmUtil.str(row, "CHK"))) {
                rows.add(row);
            }
        }
        return rows;
    }

    private String userId(HttpSession session) {
        Object v = session == null ? null : session.getAttribute("USER_ID");
        return v == null ? "ADMIN" : String.valueOf(v);
    }
}
