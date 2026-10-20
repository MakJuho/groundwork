package com.example.commerce.cmm;

import com.nexacro.uiadapter.spring.core.data.NexacroResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    @ResponseBody
    public NexacroResult handleBiz(BizException e) {
        NexacroResult result = new NexacroResult();
        result.setErrorCode(-1);
        result.setErrorMsg(e.getMessage());
        return result;
    }

    @ExceptionHandler(ExtIfException.class)
    @ResponseBody
    public NexacroResult handleExt(ExtIfException e) {
        log.warn("ext if fail [{}] {} {}", e.getIfCd(), e.getResCd(), e.getMessage());
        NexacroResult result = new NexacroResult();
        result.setErrorCode(-2);
        result.setErrorMsg("외부 연동 중 오류가 발생했습니다. (" + e.getIfCd() + ":" + e.getResCd() + ")");
        return result;
    }

    @ExceptionHandler(Exception.class)
    @ResponseBody
    public NexacroResult handleServer(Exception e) {
        log.error("server error", e);
        NexacroResult result = new NexacroResult();
        result.setErrorCode(-9);
        result.setErrorMsg("처리 중 오류가 발생했습니다. 관리자에게 문의하세요.");
        return result;
    }
}
