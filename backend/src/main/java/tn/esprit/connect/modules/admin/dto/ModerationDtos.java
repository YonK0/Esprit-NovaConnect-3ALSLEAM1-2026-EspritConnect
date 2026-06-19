package tn.esprit.connect.modules.admin.dto;

import tn.esprit.connect.common.moderation.ModerationStatus;

import java.time.Instant;
import java.util.UUID;

public final class ModerationDtos {
    private ModerationDtos() {}

    /** Common shape across all moderatable content types so the admin UI is uniform. */
    public record ModerationItem(
            UUID id,
            String type,            // "JOB" | "EVENT" | "GROUP" | "MENTOR_PROFILE"
            String title,
            String summary,
            UUID ownerId,
            String ownerEmail,
            ModerationStatus status,
            Instant createdAt
    ) {}
}
