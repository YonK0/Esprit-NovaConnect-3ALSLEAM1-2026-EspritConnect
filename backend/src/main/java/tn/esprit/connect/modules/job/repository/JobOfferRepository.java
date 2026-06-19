package tn.esprit.connect.modules.job.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.job.entity.JobOffer;
import tn.esprit.connect.modules.job.entity.JobType;

import java.util.UUID;

@Repository
public interface JobOfferRepository extends JpaRepository<JobOffer, UUID> {

    /**
     * `specialty` filter is a fuzzy text match against title + description
     * because JobOffer has no specialty FK — recruiters write free-form
     * "ML Engineer" / "Software Engineer" titles. The frontend passes the
     * specialty code AND name as a single string ("IA Intelligence
     * Artificielle Machine Learning") to maximise recall.
     */
    @Query("""
           select j from JobOffer j
           where j.deletedAt is null
             and (j.moderationStatus = 'APPROVED' or j.postedBy.id = :viewerId)
             and (:q is null or :q = ''
                  or lower(j.title) like lower(concat('%', :q, '%'))
                  or lower(j.location) like lower(concat('%', :q, '%')))
             and (:type is null or j.type = :type)
             and (:location is null or :location = ''
                  or lower(j.location) like lower(concat('%', :location, '%')))
             and (:remoteOnly = false or j.remote = true)
             and (:specialty is null or :specialty = ''
                  or lower(j.title) like lower(concat('%', :specialty, '%'))
                  or lower(j.description) like lower(concat('%', :specialty, '%')))
           order by j.createdAt desc
           """)
    Page<JobOffer> searchVisibleTo(@Param("q") String q,
                                    @Param("viewerId") UUID viewerId,
                                    @Param("type") JobType type,
                                    @Param("location") String location,
                                    @Param("remoteOnly") boolean remoteOnly,
                                    @Param("specialty") String specialty,
                                    Pageable pageable);

    Page<JobOffer> findByModerationStatusOrderByCreatedAtDesc(
            ModerationStatus status, Pageable pageable);

    /** Count of jobs posted by a recruiter in a given moderation state —
     *  feeds the HIRING_MAGNET badge threshold (≥3 approved jobs). */
    long countByPostedByIdAndModerationStatus(UUID postedById, ModerationStatus status);
}
