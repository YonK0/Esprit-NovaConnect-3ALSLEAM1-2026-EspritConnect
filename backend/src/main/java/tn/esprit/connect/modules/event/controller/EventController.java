package tn.esprit.connect.modules.event.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.event.dto.EventDtos.*;
import tn.esprit.connect.modules.event.service.EventService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/events")
@RequiredArgsConstructor
@Tag(name = "Events")
public class EventController {

    private final EventService eventService;

    @PostMapping
    public ResponseEntity<EventResponse> create(@AuthenticationPrincipal CustomUserDetails u,
                                                @Valid @RequestBody CreateEventRequest req) {
        return ResponseEntity.status(201).body(eventService.create(u.getId(), req));
    }

    @GetMapping
    public ResponseEntity<Page<EventResponse>> upcoming(@AuthenticationPrincipal CustomUserDetails u,
                                                        Pageable p) {
        return ResponseEntity.ok(eventService.upcoming(u == null ? null : u.getId(), p));
    }

    @GetMapping("/{id}")
    public ResponseEntity<EventResponse> get(@AuthenticationPrincipal CustomUserDetails u,
                                              @PathVariable UUID id) {
        return ResponseEntity.ok(eventService.get(id, u == null ? null : u.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<EventResponse> update(@AuthenticationPrincipal CustomUserDetails u,
                                                @PathVariable UUID id,
                                                @Valid @RequestBody UpdateEventRequest req) {
        return ResponseEntity.ok(eventService.update(id, u.getId(), req));
    }

    @PostMapping(value = "/{id}/banner", consumes = "multipart/form-data")
    public ResponseEntity<EventResponse> uploadBanner(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(eventService.uploadBanner(id, u.getId(), file));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails u,
                                       @PathVariable UUID id) {
        boolean isAdmin = u.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        eventService.delete(id, u.getId(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/rsvp")
    public ResponseEntity<Void> rsvp(@AuthenticationPrincipal CustomUserDetails u,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody RsvpRequest req) {
        eventService.rsvp(id, u.getId(), req);
        return ResponseEntity.noContent().build();
    }

    /** Withdraw a previously-submitted RSVP. Frees a seat if the user was GOING. */
    @DeleteMapping("/{id}/rsvp")
    public ResponseEntity<Void> cancelRsvp(@AuthenticationPrincipal CustomUserDetails u,
                                            @PathVariable UUID id) {
        eventService.cancelRsvp(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    /** Returns attendees in a given RSVP status (default: GOING). */
    @GetMapping("/{id}/attendees")
    public ResponseEntity<java.util.List<AttendeeResponse>> attendees(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "GOING")
            tn.esprit.connect.modules.event.entity.RsvpStatus status) {
        return ResponseEntity.ok(eventService.listAttendees(id, status));
    }

    @GetMapping("/{id}/detail")
    public ResponseEntity<EventDetailResponse> detail(@AuthenticationPrincipal CustomUserDetails u,
                                                       @PathVariable UUID id) {
        return ResponseEntity.ok(eventService.getDetail(id, u == null ? null : u.getId()));
    }

    // ── Speakers ──────────────────────────────────────────────────────────────

    @GetMapping("/{id}/speakers")
    public ResponseEntity<java.util.List<SpeakerResponse>> speakers(@PathVariable UUID id) {
        return ResponseEntity.ok(eventService.listSpeakers(id));
    }

    @PostMapping("/{id}/speakers")
    public ResponseEntity<SpeakerResponse> addSpeaker(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @Valid @RequestBody SpeakerRequest req) {
        return ResponseEntity.status(201).body(eventService.addSpeaker(id, u.getId(), req));
    }

    @DeleteMapping("/{id}/speakers/{speakerId}")
    public ResponseEntity<Void> deleteSpeaker(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id, @PathVariable UUID speakerId) {
        eventService.deleteSpeaker(id, speakerId, u.getId());
        return ResponseEntity.noContent().build();
    }

    // ── Agenda ────────────────────────────────────────────────────────────────

    @GetMapping("/{id}/agenda")
    public ResponseEntity<java.util.List<AgendaItemResponse>> agenda(@PathVariable UUID id) {
        return ResponseEntity.ok(eventService.listAgenda(id));
    }

    @PostMapping("/{id}/agenda")
    public ResponseEntity<AgendaItemResponse> addAgendaItem(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @Valid @RequestBody AgendaItemRequest req) {
        return ResponseEntity.status(201).body(eventService.addAgendaItem(id, u.getId(), req));
    }

    @DeleteMapping("/{id}/agenda/{itemId}")
    public ResponseEntity<Void> deleteAgendaItem(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id, @PathVariable UUID itemId) {
        eventService.deleteAgendaItem(id, itemId, u.getId());
        return ResponseEntity.noContent().build();
    }

    // ── Organizer dashboard ───────────────────────────────────────────────────

    /** Events the current user organizes — populates the manage dashboard. */
    @GetMapping("/mine")
    public ResponseEntity<Page<EventResponse>> myEvents(
            @AuthenticationPrincipal CustomUserDetails u, Pageable p) {
        return ResponseEntity.ok(eventService.myEvents(u.getId(), p));
    }

    /** Organizer view of attendees + approval state. The public
     *  /{id}/attendees endpoint above only returns a status-filtered list
     *  (no approval column, no email). This one is organizer-only and
     *  carries the full row for the manage screen. */
    @GetMapping("/{id}/attendees/manage")
    public ResponseEntity<java.util.List<EventAttendeeResponse>> manageAttendees(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id) {
        return ResponseEntity.ok(eventService.attendeesFor(id, u.getId()));
    }

    @PostMapping("/rsvps/{rsvpId}/approve")
    public ResponseEntity<Void> approveRsvp(@AuthenticationPrincipal CustomUserDetails u,
                                             @PathVariable UUID rsvpId) {
        eventService.approveRsvp(rsvpId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/rsvps/{rsvpId}/reject")
    public ResponseEntity<Void> rejectRsvp(@AuthenticationPrincipal CustomUserDetails u,
                                            @PathVariable UUID rsvpId,
                                            @RequestBody(required = false) RejectRsvpRequest req) {
        eventService.rejectRsvp(rsvpId, u.getId(), req == null ? null : req.reason());
        return ResponseEntity.noContent().build();
    }
}
