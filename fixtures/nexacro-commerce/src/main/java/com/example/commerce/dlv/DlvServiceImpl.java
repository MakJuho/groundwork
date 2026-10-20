package com.example.commerce.dlv;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmCodeService;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import com.example.commerce.ext.CarrierClient;
import com.example.commerce.ord.OrdService;
import com.example.commerce.stk.StkService;
import com.example.commerce.stl.StlService;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service("dlvService")
public class DlvServiceImpl implements DlvService {

    private static final Logger log = LoggerFactory.getLogger(DlvServiceImpl.class);

    /** 제주 우편번호 */
    private static final int[] JEJU_ZIP = {63000, 63644};

    /**
     * 제주 외 도서산간 우편번호 구간
     * 2019.06 택배사 도서산간 지역표 기준, 2021.02 운영요청 #1427 울릉/신안 추가
     */
    private static final int[][] ISLAND_ZIP = {
        {22386, 22388},   // 인천 중구 섬
        {23004, 23010},   // 인천 강화 섬
        {23100, 23116},   // 인천 옹진
        {23124, 23136},   // 인천 옹진
        {32133, 32133},   // 충남 태안 섬
        {33411, 33411},   // 충남 보령 섬
        {40200, 40240},   // 경북 울릉
        {52570, 52571},   // 경남 사천 섬
        {53031, 53033},   // 경남 통영 섬
        {53089, 53104},   // 경남 통영 섬
        {54000, 54000},   // 전북 군산 섬
        {56347, 56349},   // 전북 부안 섬
        {57068, 57069},   // 전남 영광 섬
        {58760, 58762},   // 전남 목포 섬
        {58800, 58866},   // 전남 신안
        {58953, 58958},   // 전남 진도 섬
        {59102, 59103},   // 전남 완도 섬
        {59127, 59127},   // 전남 완도 섬
        {59137, 59166},   // 전남 완도 섬
        {59421, 59421},   // 전남 보성 섬
        {59531, 59531},   // 전남 고흥 섬
        {59551, 59551},   // 전남 고흥 섬
        {59563, 59563},   // 전남 고흥 섬
        {59568, 59568},   // 전남 고흥 섬
        {59650, 59650},   // 전남 여수 섬
        {59766, 59766},   // 전남 여수 섬
        {59781, 59790}    // 전남 여수 섬
    };

    /** 택배사 추적 상태 - 배송완료 */
    private static final String TRACE_CMPL = "D";

    private final DlvMapper dlvMapper;
    private final SeqService seqService;
    private final CmmCodeService cmmCodeService;
    private final CarrierClient carrierClient;
    private final OrdService ordService;
    private final StkService stkService;
    private final StlService stlService;

    public DlvServiceImpl(DlvMapper dlvMapper, SeqService seqService, CmmCodeService cmmCodeService,
                          CarrierClient carrierClient, @Lazy OrdService ordService, StkService stkService,
                          StlService stlService) {
        this.dlvMapper = dlvMapper;
        this.seqService = seqService;
        this.cmmCodeService = cmmCodeService;
        this.carrierClient = carrierClient;
        this.ordService = ordService;
        this.stkService = stkService;
        this.stlService = stlService;
    }

    @Override
    @Transactional
    public void createDlv(String ordNo) {
        if (dlvMapper.selectDlvByOrdNo(ordNo) != null) {
            log.info("createDlv already exists ordNo={}", ordNo);
            return;
        }
        Map<String, Object> ord = ordService.getOrd(ordNo);
        String rcvZip = CmmUtil.str(ord, "RCV_ZIP");

        String islandType = getIslandType(rcvZip);
        long addFee = 0L;
        if (islandType != null) {
            String feeVal = cmmCodeService.getCodeVal("DLV_FEE", islandType);
            if (!CmmUtil.isEmpty(feeVal)) {
                addFee = Long.parseLong(feeVal);
            } else {
                addFee = "JEJU".equals(islandType) ? 3000L : 5000L;
            }
        }

        Map<String, Object> dlv = new HashMap<>();
        dlv.put("DLV_NO", seqService.next("DLV"));
        dlv.put("ORD_NO", ordNo);
        dlv.put("DLV_FEE", CmmUtil.lng(ord, "DLV_FEE"));
        dlv.put("ADD_FEE", addFee);
        dlv.put("ISLAND_YN", islandType == null ? "N" : "Y");
        dlv.put("ISLAND_TYPE", islandType);
        dlv.put("RCV_ZIP", rcvZip);
        dlv.put("REG_ID", "SYSTEM");
        dlvMapper.insertDlv(dlv);
        log.info("createDlv ordNo={} dlvNo={} zip={} island={} addFee={}", ordNo, dlv.get("DLV_NO"), rcvZip, islandType, addFee);
    }

    @Override
    public Map<String, Object> getDlv(String ordNo) {
        return dlvMapper.selectDlvByOrdNo(ordNo);
    }

    @Override
    public List<Map<String, Object>> selectDlvList(Map<String, Object> search) {
        return dlvMapper.selectDlvList(search);
    }

    @Override
    public List<Map<String, Object>> selectTraceList(String dlvNo) {
        return dlvMapper.selectTraceList(dlvNo);
    }

    /**
     * 출고. 택배사/송장번호 필수, 출고대기 건만.
     * 택배사 송장 등록 후 주문상태 출고(40), 재고 출고확정.
     */
    @Override
    @Transactional
    public int shipDlv(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String dlvNo = CmmUtil.str(row, "DLV_NO");
            String carrierCd = CmmUtil.str(row, "CARRIER_CD");
            String invcNo = CmmUtil.str(row, "INVC_NO").replaceAll("-", "");

            if (CmmUtil.isEmpty(carrierCd)) {
                throw new BizException("택배사를 선택하세요. (" + dlvNo + ")");
            }
            if (CmmUtil.isEmpty(invcNo)) {
                throw new BizException("송장번호를 입력하세요. (" + dlvNo + ")");
            }
            if (!invcNo.matches("\\d{10,12}")) {
                throw new BizException("송장번호는 숫자 10~12자리입니다. (" + dlvNo + ")");
            }
            if (CmmUtil.isEmpty(cmmCodeService.getCodeVal("CARRIER", carrierCd))) {
                throw new BizException("사용할 수 없는 택배사입니다. (" + carrierCd + ")");
            }

            Map<String, Object> dlv = dlvMapper.selectDlv(dlvNo);
            if (dlv == null) {
                throw new BizException("배송 정보가 없습니다. (" + dlvNo + ")");
            }
            if (!"R".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
                throw new BizException("출고대기 상태만 출고할 수 있습니다. (" + dlvNo + ")");
            }
            String ordNo = CmmUtil.str(dlv, "ORD_NO");
            Map<String, Object> ord = ordService.getOrd(ordNo);
            String ordStat = CmmUtil.str(ord, "ORD_STAT");
            if (!"30".equals(ordStat) && !"80".equals(ordStat)) {
                throw new BizException("상품준비 상태의 주문만 출고할 수 있습니다. (" + ordNo + ")");
            }

            List<Map<String, Object>> items = ordService.getOrdItems(ordNo);
            String itemNm = "";
            int totQty = 0;
            int itemCnt = 0;
            for (Map<String, Object> item : items) {
                if (!"N".equals(CmmUtil.str(item, "ITEM_STAT"))) {
                    continue;
                }
                if (itemCnt == 0) {
                    itemNm = CmmUtil.str(item, "PRD_NM");
                }
                totQty += CmmUtil.intg(item, "QTY");
                itemCnt++;
            }
            if (itemCnt == 0) {
                throw new BizException("출고할 주문상품이 없습니다. (" + ordNo + ")");
            }
            if (itemCnt > 1) {
                itemNm = itemNm + " 외 " + (itemCnt - 1) + "건";
            }

            // 택배사 송장 등록
            Map<String, Object> req = new HashMap<>();
            req.put("DLV_NO", dlvNo);
            req.put("ITEM_NM", itemNm);
            req.put("QTY", totQty);
            req.put("CARRIER_CD", carrierCd);
            req.put("INVC_NO", invcNo);
            req.put("ORD_NO", ordNo);
            req.put("RCV_NM", ord.get("RCV_NM"));
            req.put("RCV_HP", ord.get("RCV_HP"));
            req.put("RCV_ZIP", ord.get("RCV_ZIP"));
            req.put("RCV_ADDR", ord.get("RCV_ADDR"));
            Map<String, Object> res = carrierClient.register(req);
            String regInvcNo = CmmUtil.str(res, "INVC_NO");
            if (!CmmUtil.isEmpty(regInvcNo)) {
                invcNo = regInvcNo;
            }

            Map<String, Object> param = new HashMap<>();
            param.put("DLV_NO", dlvNo);
            param.put("CARRIER_CD", carrierCd);
            param.put("INVC_NO", invcNo);
            param.put("UPD_ID", userId);
            dlvMapper.updateDlvShip(param);

            ordService.changeStat(ordNo, "40", userId);

            for (Map<String, Object> item : items) {
                if (!"N".equals(CmmUtil.str(item, "ITEM_STAT"))) {
                    continue;
                }
                stkService.confirmOut(CmmUtil.str(item, "PRD_CD"), CmmUtil.intg(item, "QTY"), ordNo);
            }
            cnt++;
            log.info("shipDlv dlvNo={} ordNo={} carrier={} invcNo={}", dlvNo, ordNo, carrierCd, invcNo);
        }
        return cnt;
    }

    /**
     * 배송완료. 배송중 건만. 배송완료일은 처리 당일.
     * 주문상태 배송완료(50) 후 정산대상 생성.
     */
    @Override
    @Transactional
    public void completeDlv(String dlvNo, String userId) {
        Map<String, Object> dlv = dlvMapper.selectDlv(dlvNo);
        if (dlv == null) {
            throw new BizException("배송 정보가 없습니다. (" + dlvNo + ")");
        }
        if (!"S".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
            throw new BizException("배송중 상태만 배송완료 처리할 수 있습니다. (" + dlvNo + ")");
        }
        String ordNo = CmmUtil.str(dlv, "ORD_NO");

        Map<String, Object> param = new HashMap<>();
        param.put("DLV_NO", dlvNo);
        param.put("UPD_ID", userId);
        int upd = dlvMapper.updateDlvCmpl(param);
        if (upd == 0) {
            throw new BizException("이미 처리된 배송입니다. (" + dlvNo + ")");
        }

        ordService.changeStat(ordNo, "50", userId);
        stlService.createStlTarget(ordNo);
        log.info("completeDlv dlvNo={} ordNo={} userId={}", dlvNo, ordNo, userId);
    }

    /**
     * 배송조회. 택배사 추적 결과를 저장하고 마지막 상태가 배달완료면 배송완료 처리.
     */
    @Override
    @Transactional
    public List<Map<String, Object>> trackDlv(String dlvNo) {
        Map<String, Object> dlv = dlvMapper.selectDlv(dlvNo);
        if (dlv == null) {
            throw new BizException("배송 정보가 없습니다. (" + dlvNo + ")");
        }
        String carrierCd = CmmUtil.str(dlv, "CARRIER_CD");
        String invcNo = CmmUtil.str(dlv, "INVC_NO");
        if (CmmUtil.isEmpty(carrierCd) || CmmUtil.isEmpty(invcNo)) {
            throw new BizException("송장이 등록되지 않은 배송입니다. (" + dlvNo + ")");
        }

        List<Map<String, Object>> traces = carrierClient.trace(carrierCd, invcNo);
        if (traces == null) {
            traces = new ArrayList<>();
        }

        dlvMapper.deleteTrace(dlvNo);
        int seq = 1;
        for (Map<String, Object> t : traces) {
            Map<String, Object> param = new HashMap<>();
            param.put("DLV_NO", dlvNo);
            param.put("TRACE_SEQ", seq++);
            param.put("TRACE_STAT", CmmUtil.str(t, "TRACE_STAT"));
            param.put("TRACE_STAT_NM", CmmUtil.str(t, "TRACE_STAT_NM"));
            param.put("TRACE_LOC", CmmUtil.str(t, "TRACE_LOC"));
            param.put("TRACE_DT", CmmUtil.str(t, "TRACE_DT"));
            dlvMapper.insertTrace(param);
        }
        dlvMapper.updateLastTraceDt(dlvNo);

        if (!traces.isEmpty() && "S".equals(CmmUtil.str(dlv, "DLV_STAT"))) {
            String lastStat = CmmUtil.str(traces.get(traces.size() - 1), "TRACE_STAT");
            if (TRACE_CMPL.equals(lastStat)) {
                log.info("trackDlv delivered dlvNo={} -> completeDlv", dlvNo);
                completeDlv(dlvNo, "SYSTEM");
            }
        }
        /* 2020.02 중계사 전환 전 - 상태명으로 판단
        if ("배달완료".equals(CmmUtil.str(traces.get(traces.size() - 1), "TRACE_STAT_NM"))) {
            completeDlv(dlvNo, "SYSTEM");
        }
        */
        return dlvMapper.selectTraceList(dlvNo);
    }

    @Override
    public List<Map<String, Object>> selectTraceTargetList() {
        Map<String, Object> param = new HashMap<>();
        param.put("DLV_STAT", "S");
        return dlvMapper.selectTraceTargetList(param);
    }

    /** 도서산간 구분. 제주 JEJU, 그 외 도서산간 ISLAND, 일반 null */
    private String getIslandType(String rcvZip) {
        if (CmmUtil.isEmpty(rcvZip) || !rcvZip.matches("\\d{5}")) {
            return null;
        }
        int zip = Integer.parseInt(rcvZip);
        if (zip >= JEJU_ZIP[0] && zip <= JEJU_ZIP[1]) {
            return "JEJU";
        }
        for (int[] range : ISLAND_ZIP) {
            if (zip >= range[0] && zip <= range[1]) {
                return "ISLAND";
            }
        }
        return null;
    }
}
