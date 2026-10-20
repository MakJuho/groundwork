package com.example.library.service;

import com.example.library.common.ApiException;
import com.example.library.entity.Book;
import com.example.library.repository.BookRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class BookService {
    private final BookRepository books;

    public BookService(BookRepository books) {
        this.books = books;
    }

    public List<Book> findAll() {
        return books.findAll();
    }

    public Book get(Long id) {
        return books.findById(id).orElseThrow(() -> new ApiException("BOOK_NOT_FOUND", "도서를 찾을 수 없습니다."));
    }
}
