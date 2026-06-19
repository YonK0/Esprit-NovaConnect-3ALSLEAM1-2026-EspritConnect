package tn.esprit.connect.modules.mentorship.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.mentorship.entity.MentorshipRequest;
import tn.esprit.connect.modules.mentorship.entity.MentorshipStatus;

import java.util.List;
import java.util.UUID;

@Repository
public interface MentorshipRequestRepository extends JpaRepository<MentorshipRequest, UUID> {
    List<MentorshipRequest> findByMenteeId(UUID menteeId);
    List<MentorshipRequest> findByMentorProfileId(UUID mentorProfileId);
    List<MentorshipRequest> findByMentorProfileUserId(UUID mentorUserId);

    @Query("""
           select case when count(mr) > 0 then true else false end
           from MentorshipRequest mr
           where mr.status = :status
             and ((mr.mentee.id = :userA and mr.mentorProfile.user.id = :userB)
                  or (mr.mentee.id = :userB and mr.mentorProfile.user.id = :userA))
           """)
    boolean existsAcceptedBetween(@Param("userA") UUID userA,
                                  @Param("userB") UUID userB,
                                  @Param("status") MentorshipStatus status);
}
