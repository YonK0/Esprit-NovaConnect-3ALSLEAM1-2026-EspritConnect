package tn.esprit.connect.modules.job.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.job.entity.ApplicationStatus;
import tn.esprit.connect.modules.job.entity.JobType;

import java.time.Instant;
import java.util.UUID;

public final class JobDtos {
    private JobDtos() {}

    public record CreateJobRequest(
            @NotBlank @Size(max = 200) String title,
            @NotBlank String description,
            @NotNull JobType type,
            @Size(max = 160) String location,
            boolean remote,
            Instant expiresAt,
            @NotBlank String companyName) {}

    public record UpdateJobRequest(String title, String description, JobType type,
                                    String location, Boolean remote, Instant expiresAt) {}

    public record JobResponse(UUID id, String title, String description, JobType type,
                               String location, boolean remote, Instant expiresAt,
                               UUID companyId, String companyName, UUID postedById,
                               ModerationStatus moderationStatus,
                               boolean hasApplied,            // viewer-relative
                               long applicationsCount,
                               Instant createdAt) {}

    public record ApplyRequest(@Size(max = 512) String cvUrl,
                                @Size(max = 4000) String coverLetter) {}

    public record ApplicationResponse(UUID id, UUID jobOfferId, UUID applicantId,
                                       String applicantEmail, String applicantName,
                                       String cvUrl, String coverLetter,
                                       ApplicationStatus status, Instant createdAt,
                                       String jobTitle, String companyName) {}

    public record UpdateApplicationStatusRequest(@NotNull ApplicationStatus status) {}
}
