package com.example.library.dto;

import jakarta.validation.constraints.NotNull;

public record LoanRequest(@NotNull Long bookId, @NotNull Long memberId) {}
