package com.example.stay.reservation;

import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class ReservationScheduler {
    static final int HOST_CONFIRM_HOURS = 24;

    private final ReservationRepository reservationRepository;
    private final ReservationService reservationService;

    @Scheduled(fixedDelay = 600_000)
    @Transactional
    public void autoCancelUnconfirmed() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(HOST_CONFIRM_HOURS);
        reservationRepository.findByStatusAndCreatedAtBefore(ReservationStatus.PENDING, threshold)
                .forEach(r -> reservationService.changeStatus(r, ReservationStatus.CANCELLED));
    }
}
