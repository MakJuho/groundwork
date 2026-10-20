package com.example.library.service;

import com.example.library.common.ApiException;
import com.example.library.entity.Member;
import com.example.library.repository.MemberRepository;
import org.springframework.stereotype.Service;

@Service
public class MemberService {
    private final MemberRepository members;

    public MemberService(MemberRepository members) {
        this.members = members;
    }

    public Member register(String name, String email) {
        if (members.existsByEmail(email)) {
            throw new ApiException("EMAIL_DUPLICATED", "이미 가입된 이메일입니다.");
        }
        return members.save(new Member(name, email));
    }
}
