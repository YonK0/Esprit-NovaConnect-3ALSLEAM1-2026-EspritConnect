package tn.esprit.connect.modules.profile.dto;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ProfileExtensionsDtos {
    private ProfileExtensionsDtos() {}

    // ---------------- Experience ----------------

    public record CreateExperience(
            @NotBlank @Size(max = 160) String title,
            @NotBlank @Size(max = 160) String company,
            @Size(max = 160) String location,
            @NotNull LocalDate startDate,
            LocalDate endDate,
            String description
    ) {}

    public record UpdateExperience(
            String title, String company, String location,
            LocalDate startDate, LocalDate endDate, String description
    ) {}

    public record ExperienceResponse(
            UUID id, String title, String company, String location,
            LocalDate startDate, LocalDate endDate, String description
    ) {}

    // ---------------- Achievement ----------------

    public record CreateAchievement(
            @NotBlank @Size(max = 160) String title,
            @Size(max = 200) String subtitle,
            @Size(max = 64) String period
    ) {}

    public record AchievementResponse(
            UUID id, String title, String subtitle, String period, Instant createdAt
    ) {}

    // ---------------- Skill ----------------

    public record CreateSkill(
            @NotBlank @Size(max = 80) String name,
            @Min(1) @Max(5) int level
    ) {}

    public record SkillEndorserSummary(UUID userId, String firstName, String lastName) {}

    public record SkillResponse(
            UUID id,
            String name,
            int level,
            long endorsementCount,
            boolean endorsedByMe,
            boolean canEndorse,
            List<SkillEndorserSummary> endorsers
    ) {}

    // ---------------- Endorsement ----------------

    public record EndorseRequest(@NotNull UUID skillId) {}
    public record EndorserResponse(UUID userId, String email, Instant endorsedAt) {}
}
