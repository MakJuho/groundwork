package com.example.shop.member;

import com.example.shop.common.BizException;
import com.nexacro.java.xapi.data.DataSet;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MemberService {

    private final MemberMapper memberMapper;

    public MemberService(MemberMapper memberMapper) {
        this.memberMapper = memberMapper;
    }

    public List<MemberDto> findMembers(Map<String, Object> search) {
        return memberMapper.selectMembers(search);
    }

    @Transactional
    public int saveMembers(List<MemberDto> members) {
        int count = 0;
        for (MemberDto member : members) {
            int rowType = member.getRowType();
            if (rowType == DataSet.ROW_TYPE_INSERTED) {
                if (memberMapper.countById(member.getMemberId()) > 0) {
                    throw new BizException("이미 사용 중인 아이디입니다: " + member.getMemberId());
                }
                if (member.getUseYn() == null) {
                    member.setUseYn("Y");
                }
                count += memberMapper.insertMember(member);
            } else if (rowType == DataSet.ROW_TYPE_UPDATED) {
                count += memberMapper.updateMember(member);
            } else if (rowType == DataSet.ROW_TYPE_DELETED) {
                count += memberMapper.deleteMember(member.getMemberId());
            }
        }
        return count;
    }
}
