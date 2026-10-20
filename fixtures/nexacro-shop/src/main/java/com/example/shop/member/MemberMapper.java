package com.example.shop.member;

import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface MemberMapper {

    List<MemberDto> selectMembers(Map<String, Object> search);

    int countById(String memberId);

    int insertMember(MemberDto member);

    int updateMember(MemberDto member);

    int deleteMember(String memberId);
}
