package tn.esprit.connect.modules.group.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.group.entity.GroupMember;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupMemberRepository extends JpaRepository<GroupMember, UUID> {
    Optional<GroupMember> findByGroupIdAndUserId(UUID groupId, UUID userId);
    boolean existsByGroupIdAndUserId(UUID groupId, UUID userId);
    long countByGroupId(UUID groupId);
    long countByUserId(UUID userId);

    List<GroupMember> findByGroupIdOrderByRoleAscJoinedAtAsc(UUID groupId);

    /** Number of approved groups both users belong to — used for the
     *  "people you may know" score. APPROVED filter keeps PENDING / REJECTED
     *  groups from inflating the count. */
    @Query("""
           select count(distinct m1.group.id)
           from GroupMember m1, GroupMember m2
           where m1.group.id = m2.group.id
             and m1.user.id = :a and m2.user.id = :b
             and m1.group.moderationStatus = tn.esprit.connect.common.moderation.ModerationStatus.APPROVED
           """)
    long countSharedGroups(@Param("a") UUID a, @Param("b") UUID b);
}
