package tn.esprit.connect.modules.mentorship.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.mentorship.dto.MentorshipDtos.*;
import tn.esprit.connect.modules.mentorship.service.MentorshipService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/mentorship")
@RequiredArgsConstructor
@Tag(name = "Mentorship")
public class MentorshipController {

    private final MentorshipService mentorshipService;

    @PutMapping("/me")
    @PreAuthorize("hasAnyRole('MENTOR','ALUMNI','ADMIN')")
    public ResponseEntity<MentorProfileResponse> upsertMentorProfile(
            @AuthenticationPrincipal CustomUserDetails u,
            @Valid @RequestBody CreateMentorProfileRequest req) {
        return ResponseEntity.ok(mentorshipService.createOrUpdateMentorProfile(u.getId(), req));
    }

    @GetMapping("/mentors")
    public ResponseEntity<Page<MentorProfileResponse>> listMentors(
            @AuthenticationPrincipal CustomUserDetails u, Pageable p) {
        return ResponseEntity.ok(mentorshipService.listMentors(u == null ? null : u.getId(), p));
    }

    @PostMapping("/requests")
    public ResponseEntity<MentorshipRequestResponse> request(
            @AuthenticationPrincipal CustomUserDetails u,
            @Valid @RequestBody RequestMentorshipDto req) {
        return ResponseEntity.status(201).body(mentorshipService.requestMentorship(u.getId(), req));
    }

    @PatchMapping("/requests/{id}/status")
    public ResponseEntity<MentorshipRequestResponse> updateStatus(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateRequestStatusDto req) {
        return ResponseEntity.ok(mentorshipService.updateStatus(id, u.getId(), req));
    }

    @GetMapping("/requests/mine")
    public ResponseEntity<List<MentorshipRequestResponse>> mine(
            @AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(mentorshipService.myRequestsAsMentee(u.getId()));
    }

    @GetMapping("/requests/incoming")
    public ResponseEntity<List<MentorshipRequestResponse>> incoming(
            @AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(mentorshipService.incomingRequestsForMentor(u.getId()));
    }
}
