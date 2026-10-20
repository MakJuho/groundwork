package com.example.commerce.cmm;

/** 업무 규칙 위반. 화면에는 ErrorCode -1과 메시지로 전달된다. */
public class BizException extends RuntimeException {

    private final String msgCd;

    public BizException(String message) {
        this(null, message);
    }

    public BizException(String msgCd, String message) {
        super(message);
        this.msgCd = msgCd;
    }

    public String getMsgCd() {
        return msgCd;
    }
}
