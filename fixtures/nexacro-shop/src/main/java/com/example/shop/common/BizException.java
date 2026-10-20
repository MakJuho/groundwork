package com.example.shop.common;

/** 업무 규칙 위반. 화면에는 ErrorCode -1과 메시지로 전달된다. */
public class BizException extends RuntimeException {

    public BizException(String message) {
        super(message);
    }
}
