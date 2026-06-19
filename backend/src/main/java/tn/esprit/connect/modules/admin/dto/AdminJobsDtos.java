package tn.esprit.connect.modules.admin.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.UUID;

/** DTOs for the admin "Job postings & applications" console (Task-3). */
public final class AdminJobsDtos {
    private AdminJobsDtos() {}

    /** One row in the admin's list of approved job offers. */
    public record AdminJobSummary(UUID id, String title, String companyName,
                                   String postedByEmail, long applicationsCount,
                                   Instant createdAt) {}

    /** Composer payload — admin-editable subject + body. */
    public record EmailApplicationsRequest(@NotBlank String subject, @NotBlank String body) {}

    /** Result returned synchronously once the bundle has been sent. */
    public record EmailApplicationsResult(Instant sentAt, int attachmentCount,
                                           String recruiterEmail) {}
}
