package com.example.stay.member;

public enum MemberGrade {
    BASIC(0),
    SILVER(300_000),
    GOLD(1_000_000);

    private final long minTotalPaid;

    MemberGrade(long minTotalPaid) {
        this.minTotalPaid = minTotalPaid;
    }

    public static MemberGrade of(long totalPaid) {
        if (totalPaid >= GOLD.minTotalPaid) return GOLD;
        if (totalPaid >= SILVER.minTotalPaid) return SILVER;
        return BASIC;
    }
}
