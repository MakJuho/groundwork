package com.example.library.controller;

import com.example.library.dto.LoanRequest;
import com.example.library.entity.Loan;
import com.example.library.service.LoanService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/loans")
public class LoanController {
    private final LoanService service;

    public LoanController(LoanService service) {
        this.service = service;
    }

    @PostMapping
    public Loan borrow(@Valid @RequestBody LoanRequest req) {
        return service.borrow(req);
    }
}
