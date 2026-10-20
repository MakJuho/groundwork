package com.example.stay.reservation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalDate;

public record ReservationRequest(
        @NotNull LocalDate checkInDate,
        @Min(1) @Max(4) int guests,
        @Positive long totalPrice) {
}
