package tn.esprit.connect.modules.event.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.event.dto.EventDtos.*;
import tn.esprit.connect.modules.event.entity.Event;
import tn.esprit.connect.modules.event.entity.EventRsvp;
import tn.esprit.connect.modules.event.entity.RsvpStatus;
import tn.esprit.connect.modules.event.entity.EventAgendaItem;
import tn.esprit.connect.modules.event.entity.EventSpeaker;
import tn.esprit.connect.modules.event.repository.EventAgendaItemRepository;
import tn.esprit.connect.modules.event.repository.EventRepository;
import tn.esprit.connect.modules.event.repository.EventRsvpRepository;
import tn.esprit.connect.modules.event.repository.EventSpeakerRepository;
import tn.esprit.connect.modules.permissions.Permission;
import tn.esprit.connect.modules.permissions.PermissionService;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventService {

    private static final Pattern TEAMS_MEETING_URL = Pattern.compile(
            "(?i)https?://([\\w.-]+\\.)?teams\\.(microsoft\\.com|live\\.com)/.+");

    private final EventRepository eventRepository;
    private final EventRsvpRepository rsvpRepository;
    private final UserRepository userRepository;
    private final EventSpeakerRepository speakerRepository;
    private final EventAgendaItemRepository agendaRepository;
    private final ProfileRepository profileRepository;
    private final PermissionService permissionService;
    private final EventMatchService eventMatchService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;
    private final tn.esprit.connect.modules.auth.service.MailService mailService;
    private final tn.esprit.connect.modules.notification.service.NotificationService notificationService;
    private final StorageService storageService;

    @Transactional
    public EventResponse create(UUID userId, CreateEventRequest req) {
        permissionService.require(userId, Permission.EVENT_CREATE);
        User organizer = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (req.capacity() != null && req.capacity() < 1) {
            throw new BusinessException("Capacity must be at least 1");
        }
        if (req.endAt() != null && req.endAt().isBefore(req.startAt())) {
            throw new BusinessException("End time must be after start time");
        }
        if (req.virtual()) {
            validateMeetingUrl(req.meetingUrl(), true);
        }
        // Admin-posted events skip moderation — they're useful immediately and
        // the AI match-and-email fires from this path instead of from the
        // moderation flow (mirrors JobService.create).
        ModerationStatus initialStatus = organizer.getRole() == Role.ADMIN
                ? ModerationStatus.APPROVED
                : ModerationStatus.PENDING;
        String meetingUrl = req.virtual() ? normalizeMeetingUrl(req.meetingUrl()) : null;
        Event e = Event.builder()
                .organizer(organizer).title(req.title()).description(req.description())
                .startAt(req.startAt()).endAt(req.endAt()).location(req.location())
                .meetingUrl(meetingUrl)
                .bannerUrl(req.bannerUrl()).capacity(req.capacity()).virtual(req.virtual())
                .moderationStatus(initialStatus)
                .build();
        e = eventRepository.save(e);

        if (initialStatus == ModerationStatus.APPROVED) {
            final UUID eventId = e.getId();
            // Defer until AFTER commit so the async thread can see the saved row.
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() {
                        CompletableFuture.runAsync(() -> {
                            try {
                                eventMatchService.matchAndEmail(eventId);
                            } catch (Exception ex) {
                                log.warn("Event match email for admin-posted event {} failed: {}",
                                        eventId, ex.getMessage());
                            }
                        });
                    }
                });
        }
        return toDto(e, userId);
    }

    @Transactional
    public EventResponse uploadBanner(UUID eventId, UUID userId, MultipartFile file) {
        Event e = mustBeOrganizer(eventId, userId);
        validateImage(file);
        e.setBannerUrl(storageService.uploadProfileFile(e.getId(), "event-banner", file));
        return toDto(e, userId);
    }

    @Transactional(readOnly = true)
    public Page<EventResponse> upcoming(UUID viewerId, Pageable p) {
        return eventRepository.findUpcomingVisibleTo(viewerId, p)
                .map(e -> toDto(e, viewerId));
    }

    @Transactional(readOnly = true)
    public EventResponse get(UUID id, UUID viewerId) {
        Event e = eventRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Event", id));
        ensureVisible(e, viewerId);
        return toDto(e, viewerId);
    }

    @Transactional
    public EventResponse update(UUID id, UUID userId, UpdateEventRequest req) {
        Event e = mustBeOrganizer(id, userId);
        if (req.title() != null) e.setTitle(req.title());
        if (req.description() != null) e.setDescription(req.description());
        if (req.startAt() != null) e.setStartAt(req.startAt());
        if (req.endAt() != null) e.setEndAt(req.endAt());
        if (req.location() != null) e.setLocation(req.location());
        if (req.bannerUrl() != null) e.setBannerUrl(req.bannerUrl());
        if (req.capacity() != null) {
            if (req.capacity() < 1) throw new BusinessException("Capacity must be at least 1");
            // Don't allow shrinking capacity below the current GOING count — that
            // would make existing attendees "invisible" without explicit kicks.
            long going = rsvpRepository.countByEventIdAndStatus(e.getId(), RsvpStatus.GOING);
            if (req.capacity() < going) {
                throw new BusinessException(
                    "Cannot reduce capacity below current attendee count (" + going + ")");
            }
            e.setCapacity(req.capacity());
        }
        if (req.virtual() != null) {
            e.setVirtual(req.virtual());
            if (!req.virtual()) {
                e.setMeetingUrl(null);
            }
        }
        if (req.meetingUrl() != null) {
            if (!e.isVirtual()) {
                throw new BusinessException("Meeting link is only for virtual events");
            }
            validateMeetingUrl(req.meetingUrl(), true);
            e.setMeetingUrl(normalizeMeetingUrl(req.meetingUrl()));
        } else if (Boolean.TRUE.equals(req.virtual())) {
            validateMeetingUrl(null, true);
        }
        return toDto(e, userId);
    }

    @Transactional
    public void delete(UUID id, UUID userId, boolean isAdmin) {
        Event e = eventRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Event", id));
        if (!isAdmin && !e.getOrganizer().getId().equals(userId)) {
            throw new AccessDeniedException("Only organizer or admin can delete");
        }
        eventRepository.delete(e);
    }

    @Transactional
    public void rsvp(UUID eventId, UUID userId, RsvpRequest req) {
        permissionService.require(userId, Permission.EVENT_RSVP);
        // Pessimistic lock: capacity check + RSVP write must be atomic, otherwise
        // two simultaneous "GOING" responses could each see goingCount < capacity
        // and both succeed past the limit.
        Event e = eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (e.getModerationStatus() != ModerationStatus.APPROVED) {
            throw new BusinessException("RSVPs are only open for approved events");
        }
        if (e.getStartAt().isBefore(Instant.now())) {
            throw new BusinessException("Event already started");
        }
        if (e.getOrganizer().getId().equals(userId)) {
            throw new BusinessException("Organizers don't need to RSVP to their own event");
        }
        var existing = rsvpRepository.findByEventIdAndUserId(eventId, userId);
        if (req.status() == RsvpStatus.GOING && e.getCapacity() != null) {
            long going = rsvpRepository.countByEventIdAndStatus(eventId, RsvpStatus.GOING);
            boolean wasGoing = existing.map(r -> r.getStatus() == RsvpStatus.GOING).orElse(false);
            if (!wasGoing && going >= e.getCapacity()) {
                throw new BusinessException("Event is at capacity");
            }
        }
        boolean isNew = existing.isEmpty();
        EventRsvp rsvp = existing.orElseGet(() -> EventRsvp.builder()
                .event(e).user(userRepository.getReferenceById(userId)).build());
        rsvp.setStatus(req.status());
        rsvp.setRespondedAt(Instant.now());
        // New RSVPs land in PENDING (default). Changing your mind later
        // doesn't reset an already-decided approval state.
        rsvpRepository.save(rsvp);

        // Email + in-app notification to the organizer on a fresh RSVP.
        if (isNew && req.status() != RsvpStatus.NOT_GOING) {
            User attendee = userRepository.findById(userId).orElse(null);
            User organizer = e.getOrganizer();
            String attendeeName = attendee == null ? "Someone"
                    : (attendee.getProfile() != null
                        ? (attendee.getProfile().getFirstName() + " " + attendee.getProfile().getLastName()).trim()
                        : attendee.getEmail());
            String orgName = organizer.getProfile() == null ? null
                    : organizer.getProfile().getFirstName();
            mailService.sendNewRsvpEmail(organizer.getEmail(), orgName,
                    e.getTitle(), attendeeName,
                    attendee == null ? "" : attendee.getEmail(),
                    req.status().name(), e.getId().toString());
            notificationService.create(organizer.getId(), "EVENT_RSVP",
                    attendeeName + " RSVPd " + req.status().name() + " — " + e.getTitle(),
                    "Open the manage page to approve or reject this attendee.",
                    "/events/manage/" + e.getId());
        }

        // Badge: EVENT_GOER at 3+ "Going" RSVPs.
        if (req.status() == RsvpStatus.GOING) {
            long goingByUser = rsvpRepository.countByUserIdAndStatus(userId, RsvpStatus.GOING);
            badgeService.onEventGoing(userId, goingByUser);
        }
    }

    // ── Organizer-side: manage RSVPs ───────────────────────────────────────

    /** All events the current user organizes (any moderation status). */
    @Transactional(readOnly = true)
    public Page<EventResponse> myEvents(UUID userId, Pageable p) {
        return eventRepository.findByOrganizerIdOrderByStartAtDesc(userId, p)
                .map(e -> toDto(e, userId));
    }

    /** Attendees of an event — organizer-only. */
    @Transactional(readOnly = true)
    public List<EventAttendeeResponse> attendeesFor(UUID eventId, UUID requesterId) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only the organizer can view attendees");
        }
        return rsvpRepository.findByEventId(eventId).stream()
                .sorted(java.util.Comparator.comparing(EventRsvp::getRespondedAt).reversed())
                .map(r -> {
                    User u = r.getUser();
                    var p = u.getProfile();
                    String name = p != null
                            ? (p.getFirstName() + " " + p.getLastName()).trim()
                            : u.getEmail();
                    return new EventAttendeeResponse(
                            r.getId(), u.getId(), u.getEmail(), name,
                            r.getStatus(), r.getApproval(),
                            r.getRespondedAt());
                })
                .toList();
    }

    /** Approve a single RSVP — fires the .ics email to the attendee. */
    @Transactional
    public void approveRsvp(UUID rsvpId, UUID requesterId) {
        EventRsvp r = rsvpRepository.findById(rsvpId)
                .orElseThrow(() -> new ResourceNotFoundException("EventRsvp", rsvpId));
        if (!r.getEvent().getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only the event organizer can approve attendees");
        }
        r.setApproval(tn.esprit.connect.modules.event.entity.RsvpApproval.APPROVED);
        r.setApprovalDecidedAt(Instant.now());
        r.setApprovalDecidedBy(userRepository.getReferenceById(requesterId));
        Event e = r.getEvent();
        User u = r.getUser();
        var p = u.getProfile();
        String name = p != null
                ? (p.getFirstName() + " " + p.getLastName()).trim()
                : u.getEmail();
        mailService.sendRsvpApprovedEmail(u.getEmail(), name,
                e.getTitle(), resolveEventLocation(e),
                e.getStartAt(), e.getEndAt(),
                e.getId().toString(), e.getOrganizer().getEmail());
        notificationService.create(u.getId(), "EVENT_APPROVED",
                "You're confirmed for " + e.getTitle(),
                "A calendar invite has been emailed to you.",
                "/events");
    }

    /** Reject a single RSVP — fires a short rejection email. */
    @Transactional
    public void rejectRsvp(UUID rsvpId, UUID requesterId, String reason) {
        EventRsvp r = rsvpRepository.findById(rsvpId)
                .orElseThrow(() -> new ResourceNotFoundException("EventRsvp", rsvpId));
        if (!r.getEvent().getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only the event organizer can reject attendees");
        }
        r.setApproval(tn.esprit.connect.modules.event.entity.RsvpApproval.REJECTED);
        r.setApprovalDecidedAt(Instant.now());
        r.setApprovalDecidedBy(userRepository.getReferenceById(requesterId));
        mailService.sendRsvpRejectedEmail(r.getUser().getEmail(),
                r.getEvent().getTitle(), reason);
        notificationService.create(r.getUser().getId(), "EVENT_REJECTED",
                "Your RSVP for " + r.getEvent().getTitle() + " was not approved",
                reason == null || reason.isBlank() ? "" : reason,
                "/events");
    }

    /** Cancel a previously-submitted RSVP. Idempotent. */
    @Transactional
    public void cancelRsvp(UUID eventId, UUID userId) {
        rsvpRepository.findByEventIdAndUserId(eventId, userId)
                .ifPresent(rsvpRepository::delete);
    }

    @Transactional(readOnly = true)
    public List<AttendeeResponse> listAttendees(UUID eventId, RsvpStatus status) {
        return rsvpRepository.findByEventIdAndStatusOrderByRespondedAtAsc(eventId, status)
                .stream()
                .map(r -> {
                    User u = r.getUser();
                    var p = u.getProfile();
                    String name = p != null
                            ? (p.getFirstName() + " " + p.getLastName()).trim()
                            : u.getEmail();
                    return new AttendeeResponse(
                            u.getId(),
                            p == null ? null : p.getId(),
                            name.isBlank() ? u.getEmail() : name,
                            p == null ? null : p.getHeadline(),
                            p == null ? null : p.getAvatarUrl(),
                            r.getStatus(),
                            r.getRespondedAt());
                })
                .toList();
    }

    // ── Speakers ──────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<SpeakerResponse> listSpeakers(UUID eventId) {
        return speakerRepository.findByEventIdOrderBySortOrderAsc(eventId)
                .stream().map(this::toSpeakerDto).toList();
    }

    @Transactional
    public SpeakerResponse addSpeaker(UUID eventId, UUID requesterId, SpeakerRequest req) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only organizer can add speakers");
        }
        var profile = req.profileId() == null ? null
                : profileRepository.findById(req.profileId()).orElse(null);
        EventSpeaker s = EventSpeaker.builder()
                .event(e).profile(profile).name(req.name()).role(req.role())
                .company(req.company()).bio(req.bio()).avatarUrl(req.avatarUrl())
                .sortOrder(req.sortOrder()).build();
        return toSpeakerDto(speakerRepository.save(s));
    }

    @Transactional
    public void deleteSpeaker(UUID eventId, UUID speakerId, UUID requesterId) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only organizer can remove speakers");
        }
        speakerRepository.deleteById(speakerId);
    }

    // ── Agenda ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AgendaItemResponse> listAgenda(UUID eventId) {
        return agendaRepository.findByEventIdOrderBySortOrderAsc(eventId)
                .stream().map(this::toAgendaDto).toList();
    }

    @Transactional
    public AgendaItemResponse addAgendaItem(UUID eventId, UUID requesterId, AgendaItemRequest req) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only organizer can add agenda items");
        }
        var speaker = req.speakerId() == null ? null
                : speakerRepository.findById(req.speakerId()).orElse(null);
        EventAgendaItem item = EventAgendaItem.builder()
                .event(e).speaker(speaker).title(req.title()).description(req.description())
                .startTime(req.startTime()).endTime(req.endTime()).sortOrder(req.sortOrder())
                .build();
        return toAgendaDto(agendaRepository.save(item));
    }

    @Transactional
    public void deleteAgendaItem(UUID eventId, UUID itemId, UUID requesterId) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only organizer can remove agenda items");
        }
        agendaRepository.deleteById(itemId);
    }

    @Transactional(readOnly = true)
    public EventDetailResponse getDetail(UUID eventId, UUID viewerId) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        ensureVisible(e, viewerId);
        return new EventDetailResponse(toDto(e, viewerId), listSpeakers(eventId), listAgenda(eventId));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Event mustBeOrganizer(UUID eventId, UUID userId) {
        Event e = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResourceNotFoundException("Event", eventId));
        if (!e.getOrganizer().getId().equals(userId)) {
            throw new AccessDeniedException("Only the organizer can perform this action");
        }
        return e;
    }

    private void ensureVisible(Event e, UUID viewerId) {
        if (e.getModerationStatus() == ModerationStatus.APPROVED) return;
        if (viewerId != null && e.getOrganizer().getId().equals(viewerId)) return;
        throw new ResourceNotFoundException("Event", e.getId());
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Cannot upload an empty file");
        }
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new BusinessException("Only image files are supported.");
        }
        if (file.getSize() > 8 * 1024 * 1024) {
            throw new BusinessException("Image must not exceed 8 MB.");
        }
    }

    private void validateMeetingUrl(String url, boolean required) {
        if (url == null || url.isBlank()) {
            if (required) {
                throw new BusinessException(
                        "A Microsoft Teams meeting link is required for virtual events");
            }
            return;
        }
        String normalized = normalizeMeetingUrl(url);
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
            throw new BusinessException("Meeting link must start with http:// or https://");
        }
        if (!TEAMS_MEETING_URL.matcher(normalized).matches()) {
            throw new BusinessException(
                    "Virtual events must use a Microsoft Teams link "
                    + "(teams.microsoft.com or teams.live.com)");
        }
    }

    private String normalizeMeetingUrl(String url) {
        return url == null ? null : url.trim();
    }

    private String resolveEventLocation(Event e) {
        if (e.isVirtual()) {
            return e.getMeetingUrl() != null && !e.getMeetingUrl().isBlank()
                    ? e.getMeetingUrl()
                    : "Microsoft Teams (online)";
        }
        return e.getLocation();
    }

    private EventResponse toDto(Event e, UUID viewerId) {
        long going = rsvpRepository.countByEventIdAndStatus(e.getId(), RsvpStatus.GOING);
        long maybe = rsvpRepository.countByEventIdAndStatus(e.getId(), RsvpStatus.MAYBE);
        Integer seatsRemaining = e.getCapacity() == null ? null
                : (int) Math.max(0, e.getCapacity() - going);
        RsvpStatus viewerRsvp = viewerId == null ? null
                : rsvpRepository.findByEventIdAndUserId(e.getId(), viewerId)
                        .map(EventRsvp::getStatus).orElse(null);
        List<AttendeePreview> goingPreview = rsvpRepository
                .findByEventIdAndStatusOrderByRespondedAtAsc(e.getId(), RsvpStatus.GOING)
                .stream()
                .limit(3)
                .map(r -> {
                    User u = r.getUser();
                    var p = u.getProfile();
                    String name = p != null
                            ? (p.getFirstName() + " " + p.getLastName()).trim()
                            : u.getEmail();
                    return new AttendeePreview(
                            u.getId(),
                            name.isBlank() ? u.getEmail() : name,
                            p == null ? null : p.getAvatarUrl());
                })
                .toList();
        return new EventResponse(e.getId(), e.getTitle(), e.getDescription(),
                e.getStartAt(), e.getEndAt(), e.getLocation(), e.getMeetingUrl(),
                e.getBannerUrl(),
                e.getCapacity(), e.isVirtual(), e.getOrganizer().getId(),
                going, maybe, seatsRemaining, viewerRsvp,
                e.getModerationStatus(), e.getCreatedAt(), goingPreview);
    }

    private SpeakerResponse toSpeakerDto(EventSpeaker s) {
        return new SpeakerResponse(s.getId(), s.getEvent().getId(),
                s.getProfile() == null ? null : s.getProfile().getId(),
                s.getName(), s.getRole(), s.getCompany(), s.getBio(),
                s.getAvatarUrl(), s.getSortOrder());
    }

    private AgendaItemResponse toAgendaDto(EventAgendaItem a) {
        return new AgendaItemResponse(a.getId(), a.getEvent().getId(),
                a.getSpeaker() == null ? null : a.getSpeaker().getId(),
                a.getSpeaker() == null ? null : a.getSpeaker().getName(),
                a.getTitle(), a.getDescription(),
                a.getStartTime(), a.getEndTime(), a.getSortOrder());
    }
}
