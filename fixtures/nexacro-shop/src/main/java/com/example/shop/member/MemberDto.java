package com.example.shop.member;

import com.nexacro.uiadapter.spring.core.data.DataSetRowTypeAccessor;

public class MemberDto implements DataSetRowTypeAccessor {

    private int rowType;
    private String memberId;
    private String memberNm;
    private String email;
    private String phone;
    private String useYn;

    @Override
    public int getRowType() { return rowType; }
    @Override
    public void setRowType(int rowType) { this.rowType = rowType; }

    public String getMemberId() { return memberId; }
    public void setMemberId(String memberId) { this.memberId = memberId; }
    public String getMemberNm() { return memberNm; }
    public void setMemberNm(String memberNm) { this.memberNm = memberNm; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
