package tn.esprit.connect.modules.mentorship.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.mentorship.entity.MentorshipStatus;
import tn.esprit.connect.modules.mentorship.entity.MentorshipType;

import java.util.List;
import java.util.UUID;

public final class MentorshipDtos {
    private MentorshipDtos() {}

    public record CreateMentorProfileRequest(@Size(max = 4000) String bio,
                                              List<String> expertiseAreas,
                                              Integer availabilityHours,
                                              boolean acceptsFlash) {}

    public record MentorProfileResponse(UUID id, UUID userId, String userEmail, String bio,
                                         List<String> expertiseAreas,
                                         Integer availabilityHours, boolean acceptsFlash,
                                         ModerationStatus moderationStatus,
                                         String firstName, String lastName,
                                         String headline, String avatarUrl) {}

    public record RequestMentorshipDto(@NotNull UUID mentorProfileId,
                                        @Size(max = 2000) String goals,
                                        @NotNull MentorshipType type) {}

    public record MentorshipRequestResponse(UUID id, UUID menteeId, UUID mentorProfileId,
                                             String goals, MentorshipType type,
                                             MentorshipStatus status, Double matchScore) {}

    public record UpdateRequestStatusDto(@NotNull MentorshipStatus status) {}
}
