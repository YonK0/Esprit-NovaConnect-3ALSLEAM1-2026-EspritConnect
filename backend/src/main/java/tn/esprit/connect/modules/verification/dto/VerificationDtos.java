package tn.esprit.connect.modules.verification.dto;

import jakarta.validation.constraints.*;
import tn.esprit.connect.modules.user.entity.Role;

import java.util.List;
import java.util.UUID;

public final class VerificationDtos {
    private VerificationDtos() {}

    // ---------- signup-init ----------

    public record InitRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 100)
            @Pattern(regexp = "^(?=.*[A-Z])(?=.*\\d).+$",
                     message = "Password must contain uppercase + digit")
            String password,
            @NotBlank @Size(max = 80) String firstName,
            @NotBlank @Size(max = 80) String lastName,
            @NotNull @Min(2000) @Max(2030) Integer promotionYear,
            @NotBlank @Size(max = 16) String specialtyCode,
            @NotNull Role role
    ) {}

    /**
     * Either we short-circuited (@esprit.tn student) and the caller can log in
     * immediately, or we returned a sessionId that the front-end uses through
     * the rest of the flow.
     */
    public record InitResponse(
            UUID userId,
            String email,
            String status,
            UUID verificationSessionId,
            boolean verificationSkipped,
            String message
    ) {}

    // ---------- doc + face responses ----------

    public record DocumentVerifyResult(
            UUID verificationSessionId,
            String nameOnId,
            String nameOnSecondary,
            boolean nameMatch,
            double nameMatchScore,
            String idFaceB64,
            String message
    ) {}

    public record FaceVerifyResult(
            UUID verificationSessionId,
            boolean faceMatch,
            double similarity,
            int framesPassing,
            boolean livenessPassed,
            String verdict,        // "PASS" | "RETRYABLE" | "FAIL"
            int attemptsRemaining,
            List<String> reasons,
            String message
    ) {}

    // ---------- status ----------

    public record StatusResponse(
            UUID verificationSessionId,
            String currentStatus,
            int totalAttempts,
            List<AttemptSummary> history
    ) {}

    public record AttemptSummary(
            String step,
            String outcome,
            Double nameMatchScore,
            Double faceMatchScore,
            Boolean livenessPassed,
            String rejectionReason,
            String completedAt
    ) {}
}
