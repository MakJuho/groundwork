package com.example.library.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "members")
public class Member {
    @Id @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    protected Member() {}

    public Member(String name, String email) {
        this.name = name;
        this.email = email;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
}
