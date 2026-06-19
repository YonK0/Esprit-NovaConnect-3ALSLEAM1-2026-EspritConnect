package tn.esprit.connect.modules.mentorship.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.mentorship.entity.MentorProfile;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface MentorProfileRepository extends JpaRepository<MentorProfile, UUID> {

    Optional<MentorProfile> findByUserId(UUID userId);

    @Query("""
           select mp from MentorProfile mp
           where mp.deletedAt is null
             and (mp.moderationStatus = 'APPROVED' or mp.user.id = :viewerId)
           order by mp.createdAt desc
           """)
    Page<MentorProfile> findVisibleTo(@Param("viewerId") UUID viewerId, Pageable pageable);

    Page<MentorProfile> findByModerationStatusOrderByCreatedAtDesc(
            ModerationStatus status, Pageable pageable);
}
