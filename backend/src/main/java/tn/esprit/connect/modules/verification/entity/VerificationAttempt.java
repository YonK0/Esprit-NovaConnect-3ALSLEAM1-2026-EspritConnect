package tn.esprit.connect.modules.verification.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Type;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

import java.time.Instant;
import java.util.Map;

/**
 * Audit row for every step of the verification flow.
 *
 * One row per step per attempt — so a user who fails face match twice
 * and then passes will have rows for DOCUMENTS(1), FACE(1, RETRYABLE),
 * FACE(2, PASS), DECISION(PASS). The full chain is what admins review.
 *
 * Raw Python responses are stored as JSON so we can debug regressions
 * without re-running the upstream service.
 */
@Entity
@Table(name = "verification_attempts", indexes = {
        @Index(name = "idx_va_user_completed", columnList = "user_id, completed_at DESC")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VerificationAttempt extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VerificationStep step;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VerificationOutcome outcome;

    @Column(name = "id_file_url", length = 512)
    private String idFileUrl;

    @Column(name = "secondary_file_url", length = 512)
    private String secondaryFileUrl;

    @Column(name = "extracted_id_name", length = 200)
    private String extractedIdName;

    @Column(name = "extracted_secondary_name", length = 200)
    private String extractedSecondaryName;

    @Column(name = "name_match_score")
    private Double nameMatchScore;

    @Column(name = "face_match_score")
    private Double faceMatchScore;

    @Column(name = "liveness_passed")
    private Boolean livenessPassed;

    @Column(name = "attempt_number", nullable = false)
    @Builder.Default
    private Integer attemptNumber = 1;

    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    @Type(JsonType.class)
    @Column(name = "raw_response", columnDefinition = "jsonb")
    private Map<String, Object> rawResponse;

    /** Face step: ordered list of 3 MinIO object keys (one per captured frame). */
    @Type(JsonType.class)
    @Column(name = "frame_keys", columnDefinition = "jsonb")
    private java.util.List<String> frameKeys;

    @Column(name = "completed_at")
    private Instant completedAt;
}
