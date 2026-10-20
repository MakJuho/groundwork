package com.example.library.service;

import com.example.library.common.ApiException;
import com.example.library.dto.LoanRequest;
import com.example.library.entity.Book;
import com.example.library.entity.Loan;
import com.example.library.entity.Member;
import com.example.library.repository.BookRepository;
import com.example.library.repository.LoanRepository;
import com.example.library.repository.MemberRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LoanService {
    static final int MAX_ACTIVE_LOANS = 3;
    static final int LOAN_DAYS = 14;

    private final BookRepository books;
    private final MemberRepository members;
    private final LoanRepository loans;

    public LoanService(BookRepository books, MemberRepository members, LoanRepository loans) {
        this.books = books;
        this.members = members;
        this.loans = loans;
    }

    @Transactional
    public Loan borrow(LoanRequest req) {
        Book book = books.findById(req.bookId()).orElseThrow(() -> new ApiException("BOOK_NOT_FOUND", "도서를 찾을 수 없습니다."));
        Member member = members.findById(req.memberId()).orElseThrow(() -> new ApiException("MEMBER_NOT_FOUND", "회원을 찾을 수 없습니다."));
        if (!book.isAvailable()) {
            throw new ApiException("BOOK_NOT_AVAILABLE", "대출 중인 도서입니다.");
        }
        if (loans.countByMemberIdAndReturnedFalse(member.getId()) >= MAX_ACTIVE_LOANS) {
            throw new ApiException("LOAN_LIMIT_EXCEEDED", "동시에 3권까지 빌릴 수 있습니다.");
        }
        book.setAvailable(false);
        return loans.save(new Loan(book, member, LocalDate.now().plusDays(LOAN_DAYS)));
    }
}
