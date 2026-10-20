package com.example.stay.reservation;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {
    @Query("select count(r) from Reservation r where r.memberId = :memberId and r.status in ('PENDING', 'CONFIRMED')")
    long countActiveByMemberId(@Param("memberId") Long memberId);

    List<Reservation> findByStatusAndCreatedAtBefore(ReservationStatus status, LocalDateTime threshold);
}
