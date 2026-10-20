package com.example.commerce.prd;

import com.example.commerce.cmm.BizException;
import com.example.commerce.cmm.CmmUtil;
import com.example.commerce.cmm.SeqService;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 상품 / 카테고리 / 판매자.
 * 주문·정산·클레임 모듈은 getPrd, getCommRate 를 사용한다.
 */
@Service
public class PrdService {

    private static final Logger log = LoggerFactory.getLogger(PrdService.class);

    /** 판매상태 */
    public static final String SALE_ON = "ON";
    public static final String SALE_STOP = "STOP";
    public static final String SALE_END = "END";

    /** 반품비 기본값 (편도) */
    private static final long DEFAULT_RTN_FEE = 3000L;

    private final PrdMapper prdMapper;
    private final SeqService seqService;

    public PrdService(PrdMapper prdMapper, SeqService seqService) {
        this.prdMapper = prdMapper;
        this.seqService = seqService;
    }

    /* ===================================================================
     * 상품
     * =================================================================== */

    public List<Map<String, Object>> selectPrdList(Map<String, Object> search) {
        return prdMapper.selectPrdList(search);
    }

    /** 상품 단건 (PRD_CD, PRD_NM, SELLER_ID, CTG_CD, SALE_PRC, SALE_STAT, RTN_FEE) */
    public Map<String, Object> getPrd(String prdCd) {
        Map<String, Object> prd = prdMapper.selectPrd(prdCd);
        if (prd == null) {
            throw new BizException("PRD001", "상품 정보가 없습니다: " + prdCd);
        }
        return prd;
    }

    /**
     * 상품 수수료율(%).
     * 판매자 개별 수수료율 → 카테고리 → 상위 카테고리 → 기본 수수료율 순.
     */
    public BigDecimal getCommRate(String prdCd) {
        Map<String, Object> base = prdMapper.selectPrdCommBase(prdCd);
        if (base == null) {
            throw new BizException("PRD001", "상품 정보가 없습니다: " + prdCd);
        }
        Object sellerRate = base.get("SELLER_COMM_RATE");
        if (sellerRate != null) {
            return toRate(sellerRate);
        }
        Object ctgRate = base.get("CTG_COMM_RATE");
        if (ctgRate != null) {
            return toRate(ctgRate);
        }
        Object upperRate = base.get("UPPER_CTG_COMM_RATE");
        if (upperRate != null) {
            return toRate(upperRate);
        }
        // 2018.09 오픈 당시 기본 수수료율 12% (영업 협의 기준, 코드화 예정)
        log.info("[PRD] 수수료율 미설정 상품 기본 수수료율 적용 {}", prdCd);
        return new BigDecimal("12");
    }

    private BigDecimal toRate(Object v) {
        return v instanceof BigDecimal ? (BigDecimal) v : new BigDecimal(String.valueOf(v));
    }

    @Transactional
    public int savePrdList(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String rowType = CmmUtil.str(row, "_RowType_");
            row.put("USER_ID", userId);

            if ("D".equals(rowType)) {
                throw new BizException("상품은 삭제할 수 없습니다. 판매종료로 변경하세요.");
            }

            validatePrd(row);

            Map<String, Object> seller = prdMapper.selectSeller(CmmUtil.str(row, "SELLER_ID"));
            if (seller == null) {
                throw new BizException("판매자 정보가 없습니다: " + CmmUtil.str(row, "SELLER_ID"));
            }
            String sellerStat = CmmUtil.str(seller, "SELLER_STAT");

            if ("I".equals(rowType)) {
                if (!"A".equals(sellerStat)) {
                    throw new BizException("정상 상태가 아닌 판매자의 상품은 등록할 수 없습니다.");
                }
                if (CmmUtil.isEmpty(CmmUtil.str(row, "PRD_CD"))) {
                    row.put("PRD_CD", seqService.next("PRD"));
                }
                if (CmmUtil.isEmpty(CmmUtil.str(row, "SALE_STAT"))) {
                    row.put("SALE_STAT", SALE_ON);
                }
                // 반품비 미입력 시 기본 3,000원
                if (CmmUtil.isEmpty(CmmUtil.str(row, "RTN_FEE"))) {
                    row.put("RTN_FEE", DEFAULT_RTN_FEE);
                }
                cnt += prdMapper.insertPrd(row);
                log.info("[PRD] 상품 등록 {} {}", row.get("PRD_CD"), row.get("PRD_NM"));
            } else if ("U".equals(rowType)) {
                Map<String, Object> org = getPrd(CmmUtil.str(row, "PRD_CD"));
                if (SALE_ON.equals(CmmUtil.str(row, "SALE_STAT")) && !"A".equals(sellerStat)) {
                    throw new BizException("판매자가 정지 상태여서 판매중으로 변경할 수 없습니다: " + CmmUtil.str(row, "PRD_CD"));
                }
                if (!SALE_ON.equals(CmmUtil.str(row, "SALE_STAT"))
                        && SALE_ON.equals(CmmUtil.str(org, "SALE_STAT"))
                        && CmmUtil.isEmpty(CmmUtil.str(row, "STOP_RSN"))) {
                    row.put("STOP_RSN", "관리자 변경");
                }
                cnt += prdMapper.updatePrd(row);
            }
        }
        return cnt;
    }

    /** 상품 입력값 검사. 화면 fn_validate 와 같은 기준 */
    private void validatePrd(Map<String, Object> row) {
        if (CmmUtil.isEmpty(CmmUtil.str(row, "PRD_NM"))) {
            throw new BizException("상품명은 필수입니다.");
        }
        if (CmmUtil.isEmpty(CmmUtil.str(row, "SELLER_ID"))) {
            throw new BizException("판매자는 필수입니다.");
        }
        if (CmmUtil.isEmpty(CmmUtil.str(row, "CTG_CD"))) {
            throw new BizException("카테고리는 필수입니다.");
        }
        long salePrc = CmmUtil.lng(row, "SALE_PRC");
        if (salePrc <= 0) {
            throw new BizException("판매가를 입력하세요.");
        }
        // 2019.03 운영요청 #0412 판매가 100원 단위
        if (salePrc % 100 != 0) {
            throw new BizException("판매가는 100원 단위로 입력하세요: " + salePrc);
        }
        String rtnFee = CmmUtil.str(row, "RTN_FEE");
        if (!CmmUtil.isEmpty(rtnFee) && CmmUtil.lng(row, "RTN_FEE") < 0) {
            throw new BizException("반품비는 0원 이상이어야 합니다.");
        }
    }

    /* ===================================================================
     * 카테고리
     * =================================================================== */

    public List<Map<String, Object>> selectCtgList(Map<String, Object> search) {
        return prdMapper.selectCtgList(search);
    }

    @Transactional
    public int saveCtgList(List<Map<String, Object>> list, String userId) {
        int cnt = 0;
        for (Map<String, Object> row : list) {
            String rowType = CmmUtil.str(row, "_RowType_");
            String ctgCd = CmmUtil.str(row, "CTG_CD");
            row.put("USER_ID", userId);

            if ("D".equals(rowType)) {
                if (prdMapper.countChildCtg(ctgCd) > 0) {
                    throw new BizException("하위 카테고리가 있어 삭제할 수 없습니다: " + ctgCd);
                }
                if (prdMapper.countPrdByCtg(ctgCd) > 0) {
                    throw new BizException("등록된 상품이 있어 삭제할 수 없습니다. 사용여부를 N으로 변경하세요: " + ctgCd);
                }
                cnt += prdMapper.deleteCtg(ctgCd);
                continue;
            }

            if (CmmUtil.isEmpty(ctgCd) || CmmUtil.isEmpty(CmmUtil.str(row, "CTG_NM"))) {
                throw new BizException("카테고리코드와 카테고리명은 필수입니다.");
            }
            String upperCtgCd = CmmUtil.str(row, "UPPER_CTG_CD");
            if (!CmmUtil.isEmpty(upperCtgCd)) {
                if (upperCtgCd.equals(ctgCd)) {
                    throw new BizException("상위 카테고리를 자기 자신으로 지정할 수 없습니다.");
                }
                if (prdMapper.selectCtg(upperCtgCd) == null) {
                    throw new BizException("상위 카테고리가 없습니다: " + upperCtgCd);
                }
                row.put("CTG_LVL", 2);
            } else {
                row.put("CTG_LVL", 1);
            }

            // 수수료율 0~30% (빈 값이면 상위 카테고리 수수료율 사용)
            String commRate = CmmUtil.str(row, "COMM_RATE");
            if (!CmmUtil.isEmpty(commRate)) {
                BigDecimal rate = new BigDecimal(commRate);
                if (rate.compareTo(BigDecimal.ZERO) < 0 || rate.compareTo(new BigDecimal("30")) > 0) {
                    throw new BizException("카테고리 수수료율은 0~30% 범위로 입력하세요: " + ctgCd);
                }
            }
            cnt += prdMapper.mergeCtg(row);
        }
        return cnt;
    }

    /* ===================================================================
     * 판매자
     * =================================================================== */

    /**
     * 판매자 상태 변경. 정지(S)/계약종료(C) 시 해당 판매자의 판매중 상품을 일괄 판매중지한다.
     * 판매자 정보 수정은 입점관리(SCM)에서 하고, 상태 변경만 이 메서드로 반영한다.
     */
    @Transactional
    public int changeSellerStat(String sellerId, String sellerStat, String stopRsn, String userId) {
        Map<String, Object> seller = prdMapper.selectSeller(sellerId);
        if (seller == null) {
            throw new BizException("판매자 정보가 없습니다: " + sellerId);
        }
        Map<String, Object> param = new HashMap<>();
        param.put("SELLER_ID", sellerId);
        param.put("SELLER_STAT", sellerStat);
        param.put("STOP_RSN", stopRsn);
        param.put("USER_ID", userId);
        prdMapper.updateSellerStat(param);

        int stopCnt = 0;
        if ("S".equals(sellerStat) || "C".equals(sellerStat)) {
            param.put("STOP_RSN", "판매자 정지(" + (CmmUtil.isEmpty(stopRsn) ? "-" : stopRsn) + ")");
            stopCnt = prdMapper.updatePrdStopBySeller(param);
            log.info("[PRD] 판매자 {} 정지 - 상품 {}건 판매중지", sellerId, stopCnt);
        }
        // 정지 해제 시 상품은 자동 재개하지 않음 (판매자가 직접 판매중 전환)
        return stopCnt;
    }
}
