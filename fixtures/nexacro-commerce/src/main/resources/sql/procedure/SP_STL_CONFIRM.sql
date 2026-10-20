/*
 * 정산 확정 배치
 *  - 정산대기(RDY) 건 중 정산기준일(BASE_DT) 다음날부터 기준일자(P_BASE_YMD)까지의
 *    영업일(주말, TB_CMM_HOLIDAY 제외) 수가 P_BIZ_DAYS 이상인 건을 확정(CNF)한다.
 *  - 지급예정일은 확정일 이후 첫 수요일 (휴일이면 다음 영업일)
 *  - 확정 건은 판매자 x 지급예정일로 TB_STL_PAY에 집계한다.
 *
 * 2019.04.02 최초 작성
 * 2020.11.03 운영요청 #1182 반영 - 지급예정일 휴일 보정
 * 2021.07    정책변경 - 지급주기 주 2회(월,목) -> 주 1회(수)
 * 2022.09.14 운영요청 #2047 - 정지 판매자 확정 제외 조건 삭제 (지급 단계에서 보류 처리)
 */
CREATE OR REPLACE PROCEDURE SP_STL_CONFIRM (
    P_BASE_YMD   IN  VARCHAR2,
    P_BIZ_DAYS   IN  NUMBER,
    P_CNT        OUT NUMBER
)
IS
    V_BASE_DT     DATE;
    V_CNFM_DT     DATE;
    V_PAY_SCHD    DATE;
    V_BIZ_CNT     NUMBER;
    V_CHK_DT      DATE;
    V_HOLI_CNT    NUMBER;
    V_BATCH_SEQ   NUMBER;
    V_ERR_MSG     VARCHAR2(1000);

    CURSOR C_STL IS
        SELECT S.STL_NO, S.SELLER_ID, TRUNC(S.BASE_DT) AS BASE_DT
          FROM TB_STL S
         WHERE S.STL_STAT = 'RDY'
           AND S.BASE_DT < TO_DATE(P_BASE_YMD, 'YYYYMMDD')
         ORDER BY S.BASE_DT, S.STL_NO;

    -- 영업일 여부 (주말, 휴일 제외)
    FUNCTION FN_IS_BIZ_DAY (P_DT IN DATE) RETURN BOOLEAN
    IS
        V_CNT NUMBER;
    BEGIN
        IF TO_CHAR(P_DT, 'DY', 'NLS_DATE_LANGUAGE=AMERICAN') IN ('SAT', 'SUN') THEN
            RETURN FALSE;
        END IF;
        SELECT COUNT(*)
          INTO V_CNT
          FROM TB_CMM_HOLIDAY
         WHERE HOLI_YMD = TO_CHAR(P_DT, 'YYYYMMDD');
        RETURN V_CNT = 0;
    END FN_IS_BIZ_DAY;

BEGIN
    P_CNT     := 0;
    V_BASE_DT := TO_DATE(P_BASE_YMD, 'YYYYMMDD');
    V_CNFM_DT := SYSDATE;

    SELECT SQ_STL_BATCH_HIST.NEXTVAL INTO V_BATCH_SEQ FROM DUAL;
    INSERT INTO TB_STL_BATCH_HIST (BATCH_SEQ, BATCH_ID, BASE_YMD, PROC_CNT, RSLT_CD, STRT_DT)
    VALUES (V_BATCH_SEQ, 'SP_STL_CONFIRM', P_BASE_YMD, 0, 'R', SYSDATE);

    -- 지급예정일 : 기준일 이후 첫 수요일
    V_PAY_SCHD := V_BASE_DT + 1;
    WHILE TO_CHAR(V_PAY_SCHD, 'DY', 'NLS_DATE_LANGUAGE=AMERICAN') <> 'WED' LOOP
        V_PAY_SCHD := V_PAY_SCHD + 1;
    END LOOP;
    -- 2020.11.03 수요일이 휴일이면 다음 영업일
    WHILE NOT FN_IS_BIZ_DAY(V_PAY_SCHD) LOOP
        V_PAY_SCHD := V_PAY_SCHD + 1;
    END LOOP;

    FOR R IN C_STL LOOP
        V_BIZ_CNT := 0;
        V_CHK_DT  := R.BASE_DT + 1;

        WHILE V_CHK_DT <= V_BASE_DT AND V_BIZ_CNT < P_BIZ_DAYS LOOP
            IF FN_IS_BIZ_DAY(V_CHK_DT) THEN
                V_BIZ_CNT := V_BIZ_CNT + 1;
            END IF;
            V_CHK_DT := V_CHK_DT + 1;
        END LOOP;

        IF V_BIZ_CNT >= P_BIZ_DAYS THEN
            UPDATE TB_STL
               SET STL_STAT    = 'CNF',
                   CNFM_DT     = V_CNFM_DT,
                   CNFM_TYPE   = 'B',
                   PAY_SCHD_DT = TO_CHAR(V_PAY_SCHD, 'YYYYMMDD'),
                   UPD_DT      = SYSDATE,
                   UPD_ID      = 'BATCH'
             WHERE STL_NO   = R.STL_NO
               AND STL_STAT = 'RDY';

            P_CNT := P_CNT + SQL%ROWCOUNT;
        END IF;
    END LOOP;

    /*
    -- 2021.07 이전 지급주기 (월,목)
    IF TO_CHAR(V_BASE_DT, 'D') IN ('2', '3', '4') THEN
        V_PAY_SCHD := NEXT_DAY(V_BASE_DT, '목');
    ELSE
        V_PAY_SCHD := NEXT_DAY(V_BASE_DT, '월');
    END IF;
    */

    -- 판매자별 지급 집계
    MERGE INTO TB_STL_PAY T
    USING (
        SELECT S.SELLER_ID,
               S.PAY_SCHD_DT,
               COUNT(*)       AS STL_CNT,
               SUM(S.STL_AMT) AS PAY_AMT,
               MAX(L.BANK_CD)     AS BANK_CD,
               MAX(L.STL_ACCT_NO) AS STL_ACCT_NO
          FROM TB_STL S
          JOIN TB_SELLER L ON L.SELLER_ID = S.SELLER_ID
         WHERE S.STL_STAT    = 'CNF'
           AND S.PAY_SCHD_DT = TO_CHAR(V_PAY_SCHD, 'YYYYMMDD')
         GROUP BY S.SELLER_ID, S.PAY_SCHD_DT
    ) A
       ON (T.SELLER_ID = A.SELLER_ID AND T.PAY_SCHD_DT = A.PAY_SCHD_DT)
     WHEN MATCHED THEN
          UPDATE SET T.STL_CNT     = A.STL_CNT,
                     T.PAY_AMT     = A.PAY_AMT,
                     T.BANK_CD     = A.BANK_CD,
                     T.STL_ACCT_NO = A.STL_ACCT_NO,
                     T.UPD_DT      = SYSDATE
           WHERE T.PAY_STAT = 'W'
     WHEN NOT MATCHED THEN
          INSERT (STL_PAY_NO, SELLER_ID, PAY_SCHD_DT, STL_CNT, PAY_AMT, PAY_STAT, BANK_CD, STL_ACCT_NO, REG_DT)
          VALUES ('SPY' || TO_CHAR(SYSDATE, 'YYYYMMDD') || LPAD(SQ_STL_PAY.NEXTVAL, 6, '0'),
                  A.SELLER_ID, A.PAY_SCHD_DT, A.STL_CNT, A.PAY_AMT, 'W', A.BANK_CD, A.STL_ACCT_NO, SYSDATE);

    UPDATE TB_STL_BATCH_HIST
       SET PROC_CNT = P_CNT,
           RSLT_CD  = 'S',
           END_DT   = SYSDATE
     WHERE BATCH_SEQ = V_BATCH_SEQ;

EXCEPTION
    WHEN OTHERS THEN
        V_ERR_MSG := SUBSTR(SQLERRM, 1, 1000);
        ROLLBACK;
        INSERT INTO TB_STL_BATCH_HIST (BATCH_SEQ, BATCH_ID, BASE_YMD, PROC_CNT, RSLT_CD, ERR_MSG, STRT_DT, END_DT)
        VALUES (SQ_STL_BATCH_HIST.NEXTVAL, 'SP_STL_CONFIRM', P_BASE_YMD, 0, 'F', V_ERR_MSG, SYSDATE, SYSDATE);
        COMMIT;
        RAISE;
END SP_STL_CONFIRM;
/
