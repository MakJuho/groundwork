package com.example.stay.reservation;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {
    private final ReservationService reservationService;
    private final ReservationRepository reservationRepository;

    @PostMapping
    public Reservation reserve(@AuthenticationPrincipal(expression = "id") Long memberId, @Valid @RequestBody ReservationRequest request) {
        return reservationService.reserve(memberId, request);
    }

    @PostMapping("/{id}/cancel")
    public long cancel(@AuthenticationPrincipal(expression = "id") Long memberId, @PathVariable Long id) {
        return reservationService.cancel(memberId, id);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/force-cancel")
    public void forceCancel(@PathVariable Long id) {
        Reservation reservation = reservationRepository.findById(id).orElseThrow();
        reservationService.changeStatus(reservation, ReservationStatus.CANCELLED);
    }
}
