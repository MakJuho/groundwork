-- 상품 재고 (상품당 1건, 단일 창고)
CREATE TABLE TB_STK (
    PRD_CD          VARCHAR2(20)  NOT NULL,
    STK_QTY         NUMBER(8)     DEFAULT 0 NOT NULL,   -- 실재고
    RSV_QTY         NUMBER(8)     DEFAULT 0 NOT NULL,   -- 주문 예약(결제~출고 전)
    SAFE_QTY        NUMBER(8)     DEFAULT 0 NOT NULL,   -- 안전재고
    LAST_IN_DT      DATE,
    LAST_OUT_DT     DATE,
    UPD_ID          VARCHAR2(20),
    UPD_DT          DATE,
    CONSTRAINT PK_TB_STK PRIMARY KEY (PRD_CD),
    CONSTRAINT CK_TB_STK_01 CHECK (STK_QTY >= 0 AND RSV_QTY >= 0)
);

-- 재고 변경 이력
-- CHG_TYPE: RSV 예약, RLS 예약해제, OUT 출고, RTN 반품입고, ADJ 관리자조정
CREATE TABLE TB_STK_HIST (
    PRD_CD          VARCHAR2(20)  NOT NULL,
    HIST_SEQ        NUMBER(10)    NOT NULL,
    CHG_TYPE        VARCHAR2(3)   NOT NULL,
    CHG_QTY         NUMBER(8)     NOT NULL,
    BF_STK_QTY      NUMBER(8),
    AF_STK_QTY      NUMBER(8),
    BF_RSV_QTY      NUMBER(8),
    AF_RSV_QTY      NUMBER(8),
    ORD_NO          VARCHAR2(20),
    CHG_RSN         VARCHAR2(300),
    REG_DT          DATE          DEFAULT SYSDATE NOT NULL,
    REG_ID          VARCHAR2(20),
    CONSTRAINT PK_TB_STK_HIST PRIMARY KEY (PRD_CD, HIST_SEQ)
);

CREATE INDEX IX_TB_STK_HIST_01 ON TB_STK_HIST (ORD_NO);
