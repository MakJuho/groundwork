package com.example.stay.reservation;

public enum ReservationStatus {
    PENDING, CONFIRMED, CANCELLED, COMPLETED;

    public boolean canChangeTo(ReservationStatus next) {
        return switch (this) {
            case PENDING -> next == CONFIRMED || next == CANCELLED;
            case CONFIRMED -> next == COMPLETED || next == CANCELLED;
            case CANCELLED, COMPLETED -> false;
        };
    }
}
