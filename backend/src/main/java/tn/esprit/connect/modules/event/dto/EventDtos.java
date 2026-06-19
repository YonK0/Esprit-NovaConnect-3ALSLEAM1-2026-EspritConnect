package tn.esprit.connect.modules.event.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.event.entity.RsvpApproval;
import tn.esprit.connect.modules.event.entity.RsvpStatus;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class EventDtos {
    private EventDtos() {}

    public record CreateEventRequest(
            @NotBlank @Size(max = 200) String title,
            String description,
            @NotNull Instant startAt,
            Instant endAt,
            String location,
            @Size(max = 512) String meetingUrl,
            String bannerUrl,
            Integer capacity,
            boolean virtual) {}

    public record UpdateEventRequest(String title, String description, Instant startAt,
                                      Instant endAt, String location, String meetingUrl,
                                      String bannerUrl,
                                      Integer capacity, Boolean virtual) {}

    public record EventResponse(UUID id, String title, String description, Instant startAt,
                                 Instant endAt, String location, String meetingUrl,
                                 String bannerUrl,
                                 Integer capacity, boolean virtual,
                                 UUID organizerId, long goingCount,
                                 long maybeCount,
                                 Integer seatsRemaining,   // null when capacity unset
                                 RsvpStatus viewerRsvp,    // null when viewer is anon or hasn't RSVPd
                                 ModerationStatus moderationStatus, Instant createdAt,
                                 List<AttendeePreview> goingPreview) {}

    /** Up to 3 "Going" attendees shown on event cards. */
    public record AttendeePreview(UUID userId, String name, String avatarUrl) {}

    /** Compact attendee row for the going/maybe lists shown on the event page. */
    public record AttendeeResponse(
            UUID userId, UUID profileId, String name, String headline,
            String avatarUrl, RsvpStatus status, Instant respondedAt) {}

    public record RsvpRequest(@NotNull RsvpStatus status) {}

    /** Used by the organizer's "manage event" screen — one row per RSVP. */
    public record EventAttendeeResponse(
            UUID rsvpId, UUID userId, String email, String name,
            RsvpStatus status, RsvpApproval approval,
            Instant respondedAt
    ) {}

    public record RejectRsvpRequest(@Size(max = 500) String reason) {}

    // ── Speakers ──────────────────────────────────────────────────────────────
    public record SpeakerRequest(
            @NotBlank @Size(max = 160) String name,
            @Size(max = 160) String role,
            @Size(max = 160) String company,
            String bio,
            @Size(max = 512) String avatarUrl,
            UUID profileId,
            int sortOrder
    ) {}

    public record SpeakerResponse(
            UUID id, UUID eventId, UUID profileId,
            String name, String role, String company,
            String bio, String avatarUrl, int sortOrder
    ) {}

    // ── Agenda items ──────────────────────────────────────────────────────────
    public record AgendaItemRequest(
            @NotBlank @Size(max = 200) String title,
            String description,
            Instant startTime,
            Instant endTime,
            UUID speakerId,
            int sortOrder
    ) {}

    public record AgendaItemResponse(
            UUID id, UUID eventId, UUID speakerId, String speakerName,
            String title, String description,
            Instant startTime, Instant endTime, int sortOrder
    ) {}

    public record EventDetailResponse(
            EventResponse event,
            List<SpeakerResponse> speakers,
            List<AgendaItemResponse> agenda
    ) {}
}
