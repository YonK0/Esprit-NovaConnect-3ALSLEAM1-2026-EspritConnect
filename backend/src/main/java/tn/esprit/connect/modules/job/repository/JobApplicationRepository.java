package tn.esprit.connect.modules.job.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.job.entity.JobApplication;

import java.util.List;
import java.util.UUID;

@Repository
public interface JobApplicationRepository extends JpaRepository<JobApplication, UUID> {
    List<JobApplication> findByJobOfferId(UUID jobOfferId);
    boolean existsByJobOfferIdAndApplicantId(UUID jobOfferId, UUID applicantId);
    long countByJobOfferId(UUID jobOfferId);
    
    @Query("SELECT a FROM JobApplication a " +
           "LEFT JOIN FETCH a.jobOffer j " +
           "LEFT JOIN FETCH j.company " +
           "WHERE a.applicant.id = :applicantId " +
           "ORDER BY a.createdAt DESC")
    List<JobApplication> findByApplicantIdOrderByCreatedAtDesc(@Param("applicantId") UUID applicantId);
}
