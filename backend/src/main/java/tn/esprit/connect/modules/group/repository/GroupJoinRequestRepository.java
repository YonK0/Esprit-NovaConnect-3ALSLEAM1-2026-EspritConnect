package tn.esprit.connect.modules.group.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.group.entity.GroupJoinRequest;
import tn.esprit.connect.modules.group.entity.JoinRequestStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupJoinRequestRepository extends JpaRepository<GroupJoinRequest, UUID> {

    Optional<GroupJoinRequest> findByGroupIdAndUserId(UUID groupId, UUID userId);

    boolean existsByGroupIdAndUserIdAndStatus(UUID groupId, UUID userId, JoinRequestStatus status);

    List<GroupJoinRequest> findByGroupIdAndStatusOrderByCreatedAtDesc(
            UUID groupId, JoinRequestStatus status);
}
