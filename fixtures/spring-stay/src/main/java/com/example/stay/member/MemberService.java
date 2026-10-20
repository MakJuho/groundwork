package com.example.stay.member;

import com.example.stay.common.BusinessException;
import com.example.stay.reservation.ReservationRepository;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberService {
    static final int MAX_LOGIN_FAIL = 5;
    static final int LOCK_MINUTES = 30;
    static final int DORMANT_DAYS = 365;

    private final MemberRepository memberRepository;
    private final ReservationRepository reservationRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public Member signup(SignupRequest request) {
        if (memberRepository.existsByEmail(request.email())) {
            throw new BusinessException("DUPLICATE_EMAIL", "이미 가입된 이메일입니다.");
        }
        Member member = new Member();
        member.setEmail(request.email());
        member.setPasswordHash(passwordEncoder.encode(request.password()));
        return memberRepository.save(member);
    }

    @Transactional(noRollbackFor = BusinessException.class)
    public Member login(String email, String password) {
        Member member = memberRepository.findByEmail(email)
                .orElseThrow(() -> new BusinessException("LOGIN_FAILED", "이메일 또는 비밀번호가 올바르지 않습니다."));
        if (member.getLockedUntil() != null && member.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new BusinessException("ACCOUNT_LOCKED", "로그인 시도 초과로 계정이 잠겼습니다.");
        }
        if (!passwordEncoder.matches(password, member.getPasswordHash())) {
            member.setLoginFailCount(member.getLoginFailCount() + 1);
            if (member.getLoginFailCount() >= MAX_LOGIN_FAIL) {
                member.setLockedUntil(LocalDateTime.now().plusMinutes(LOCK_MINUTES));
                member.setLoginFailCount(0);
            }
            throw new BusinessException("LOGIN_FAILED", "이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        member.setLoginFailCount(0);
        member.setLastLoginAt(LocalDateTime.now());
        member.setDormant(false);
        return member;
    }

    @Transactional
    public void addPaidAmount(Member member, long amount) {
        member.setTotalPaidAmount(member.getTotalPaidAmount() + amount);
        member.setGrade(MemberGrade.of(member.getTotalPaidAmount()));
    }

    @Transactional
    public void withdraw(Long memberId) {
        if (reservationRepository.countActiveByMemberId(memberId) > 0) {
            throw new BusinessException("ACTIVE_RESERVATION_EXISTS", "진행 중인 예약이 있으면 탈퇴할 수 없습니다.");
        }
        memberRepository.deleteById(memberId);
    }

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void markDormantMembers() {
        memberRepository.markDormantBefore(LocalDateTime.now().minusDays(DORMANT_DAYS));
    }
}
