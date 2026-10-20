package com.example.stay.reservation;

import com.example.stay.common.BusinessException;
import com.example.stay.member.Member;
import com.example.stay.member.MemberRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReservationService {
    static final int MIN_DAYS_AHEAD = 1;
    static final int MAX_DAYS_AHEAD = 90;
    static final int MAX_ACTIVE_RESERVATIONS = 2;
    static final double DEPOSIT_RATE = 0.1;
    static final int FREE_CANCEL_DAYS = 3;
    static final double LATE_CANCEL_FEE_RATE = 0.5;

    private final ReservationRepository reservationRepository;
    private final MemberRepository memberRepository;

    @Transactional
    public Reservation reserve(Long memberId, ReservationRequest request) {
        Member member = memberRepository.findById(memberId).orElseThrow();
        if (member.isDormant()) {
            throw new BusinessException("DORMANT_MEMBER", "휴면 회원은 예약할 수 없습니다.");
        }
        long daysAhead = ChronoUnit.DAYS.between(LocalDate.now(), request.checkInDate());
        if (daysAhead < MIN_DAYS_AHEAD) {
            throw new BusinessException("TOO_LATE_TO_RESERVE", "체크인 하루 전까지 예약할 수 있습니다.");
        }
        if (daysAhead > MAX_DAYS_AHEAD) {
            throw new BusinessException("TOO_EARLY_TO_RESERVE", "최대 90일 이후까지만 예약할 수 있습니다.");
        }
        if (reservationRepository.countActiveByMemberId(memberId) >= MAX_ACTIVE_RESERVATIONS) {
            throw new BusinessException("TOO_MANY_RESERVATIONS", "진행 중인 예약은 최대 2건입니다.");
        }
        Reservation reservation = new Reservation();
        reservation.setMemberId(memberId);
        reservation.setCheckInDate(request.checkInDate());
        reservation.setGuests(request.guests());
        reservation.setTotalPrice(request.totalPrice());
        reservation.setDeposit(Math.round(request.totalPrice() * DEPOSIT_RATE));
        reservation.setStatus(ReservationStatus.PENDING);
        reservation.setCreatedAt(LocalDateTime.now());
        return reservationRepository.save(reservation);
    }

    @Transactional
    public long cancel(Long memberId, Long reservationId) {
        Reservation reservation = reservationRepository.findById(reservationId).orElseThrow();
        if (!reservation.getMemberId().equals(memberId)) {
            throw new BusinessException("FORBIDDEN", "본인 예약만 취소할 수 있습니다.");
        }
        long refund = calculateRefund(reservation, LocalDate.now());
        changeStatus(reservation, ReservationStatus.CANCELLED);
        return refund;
    }

    long calculateRefund(Reservation reservation, LocalDate today) {
        long daysBefore = ChronoUnit.DAYS.between(today, reservation.getCheckInDate());
        if (daysBefore <= 0) {
            return 0;
        }
        if (daysBefore < FREE_CANCEL_DAYS) {
            return Math.round(reservation.getTotalPrice() * (1 - LATE_CANCEL_FEE_RATE));
        }
        return reservation.getTotalPrice();
    }

    @Transactional
    public void changeStatus(Reservation reservation, ReservationStatus next) {
        if (!reservation.getStatus().canChangeTo(next)) {
            throw new BusinessException("INVALID_STATUS", reservation.getStatus() + " -> " + next + " 변경 불가");
        }
        reservation.setStatus(next);
    }
}
