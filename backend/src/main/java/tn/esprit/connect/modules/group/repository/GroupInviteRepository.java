package tn.esprit.connect.modules.group.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.group.entity.GroupInvite;
import tn.esprit.connect.modules.group.entity.InviteStatus;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupInviteRepository extends JpaRepository<GroupInvite, UUID> {

    Optional<GroupInvite> findByGroupIdAndInvitedUserId(UUID groupId, UUID invitedUserId);

    boolean existsByGroupIdAndInvitedUserIdAndStatus(
            UUID groupId, UUID invitedUserId, InviteStatus status);

    Optional<GroupInvite> findByGroupIdAndInvitedUserIdAndStatus(
            UUID groupId, UUID invitedUserId, InviteStatus status);
}
