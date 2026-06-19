package tn.esprit.connect.modules.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * DTOs for the admin verifications tab.
 *
 * Carries enough info for the admin to make a decision: who the user is,
 * what role they claimed, their last verification scores, the full audit
 * chain, and short-lived presigned URLs to the captured artifacts in MinIO.
 */
public final class VerificationAdminDtos {
    private VerificationAdminDtos() {}

    public record PendingVerification(
            UUID userId,
            String email,
            String firstName,
            String lastName,
            String role,
            String status,                   // PENDING / PENDING_APPROVAL / VERIFICATION_FAILED / DRAFT / ACTIVE
            Integer attemptsCount,
            Instant verifiedAt,
            Instant signupAt,
            String specialtyCode,
            Integer promotionYear,
            boolean identityVerified,        // true once the face/doc flow passed
            Instant identityVerificationRequestedAt, // set while an admin-requested re-verification is open
            LastAttemptSummary lastAttempt   // null when no attempts exist yet (legacy PENDING)
    ) {}

    public record LastAttemptSummary(
            String step,
            String outcome,
            Double nameMatchScore,
            Double faceMatchScore,
            Boolean livenessPassed,
            String rejectionReason,
            Instant completedAt,
            // Short-lived presigned download URLs; null when nothing was uploaded
            String idFileUrl,
            String secondaryFileUrl,
            List<String> frameUrls
    ) {}

    /** Full chain for a single user — used by the "View details" modal. */
    public record VerificationDetail(
            PendingVerification user,
            List<LastAttemptSummary> history
    ) {}

    public record RejectRequest(
            @NotBlank @Size(max = 500) String reason
    ) {}
}
