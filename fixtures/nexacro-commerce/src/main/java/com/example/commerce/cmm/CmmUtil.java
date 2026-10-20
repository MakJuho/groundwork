package com.example.commerce.cmm;

import java.math.BigDecimal;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Map;

/** 공통 유틸. Map 파라미터에서 값을 꺼낼 때 쓴다. */
public final class CmmUtil {

    private CmmUtil() {
    }

    public static String str(Map<String, Object> map, String key) {
        Object v = map == null ? null : map.get(key);
        return v == null ? "" : String.valueOf(v).trim();
    }

    public static long lng(Map<String, Object> map, String key) {
        Object v = map == null ? null : map.get(key);
        if (v == null || "".equals(String.valueOf(v).trim())) {
            return 0L;
        }
        if (v instanceof Number) {
            return ((Number) v).longValue();
        }
        return new BigDecimal(String.valueOf(v).trim()).longValue();
    }

    public static int intg(Map<String, Object> map, String key) {
        return (int) lng(map, key);
    }

    public static boolean isEmpty(String s) {
        return s == null || s.trim().length() == 0;
    }

    public static String today() {
        return new SimpleDateFormat("yyyyMMdd").format(new Date());
    }

    public static String now() {
        return new SimpleDateFormat("yyyyMMddHHmmss").format(new Date());
    }

    /** 원 단위 절사 (10원 미만 버림) */
    public static long truncWon(double amt) {
        return (long) (Math.floor(amt / 10) * 10);
    }
}
