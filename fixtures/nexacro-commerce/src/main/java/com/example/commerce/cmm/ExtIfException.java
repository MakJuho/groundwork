package com.example.commerce.cmm;

/** 외부 연동(PG, 택배사) 실패. 화면에는 ErrorCode -2로 전달된다. */
public class ExtIfException extends RuntimeException {

    private final String ifCd;
    private final String resCd;

    public ExtIfException(String ifCd, String resCd, String message) {
        super(message);
        this.ifCd = ifCd;
        this.resCd = resCd;
    }

    public String getIfCd() { return ifCd; }
    public String getResCd() { return resCd; }
}
