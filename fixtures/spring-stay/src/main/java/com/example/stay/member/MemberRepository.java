package com.example.stay.member;

import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MemberRepository extends JpaRepository<Member, Long> {
    boolean existsByEmail(String email);

    Optional<Member> findByEmail(String email);

    @Modifying
    @Query("update Member m set m.dormant = true where m.lastLoginAt < :threshold")
    int markDormantBefore(@Param("threshold") LocalDateTime threshold);
}
