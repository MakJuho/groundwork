package com.example.library.controller;

import com.example.library.entity.Member;
import com.example.library.service.MemberService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/members")
public class MemberController {
    private final MemberService service;

    public MemberController(MemberService service) {
        this.service = service;
    }

    @PostMapping
    public Member register(@RequestParam String name, @RequestParam String email) {
        return service.register(name, email);
    }
}
