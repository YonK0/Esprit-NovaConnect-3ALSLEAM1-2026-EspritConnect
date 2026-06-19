package tn.esprit.connect.modules.verification.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.verification.entity.VerificationAttempt;
import tn.esprit.connect.modules.verification.entity.VerificationStep;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface VerificationAttemptRepository extends JpaRepository<VerificationAttempt, UUID> {

    /** Most recent attempt by user — used to render the moderation queue. */
    Optional<VerificationAttempt> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Full chain for a single user, oldest first; admin uses this to audit. */
    List<VerificationAttempt> findByUserIdOrderByCreatedAtAsc(UUID userId);

    /** Count attempts at a given step for a user — drives the retry cap. */
    long countByUserIdAndStep(UUID userId, VerificationStep step);
}
