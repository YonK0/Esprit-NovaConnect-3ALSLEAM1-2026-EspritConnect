package tn.esprit.connect.modules.job.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.job.dto.JobDtos.*;
import tn.esprit.connect.modules.job.entity.JobType;
import tn.esprit.connect.modules.job.service.JobService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/jobs")
@RequiredArgsConstructor
@Tag(name = "Jobs")
public class JobController {

    private final JobService jobService;

    @PostMapping
    @PreAuthorize("hasAnyRole('RECRUITER','ADMIN')")
    public ResponseEntity<JobResponse> create(@AuthenticationPrincipal CustomUserDetails u,
                                              @Valid @RequestBody CreateJobRequest req) {
        return ResponseEntity.status(201).body(jobService.create(u.getId(), req));
    }

    @GetMapping
    public ResponseEntity<Page<JobResponse>> list(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false) JobType type,
            @RequestParam(required = false, defaultValue = "") String location,
            @RequestParam(required = false, defaultValue = "false") boolean remoteOnly,
            @RequestParam(required = false, defaultValue = "") String specialty,
            Pageable p) {
        return ResponseEntity.ok(jobService.search(
                q, u == null ? null : u.getId(), type, location, remoteOnly, specialty, p));
    }

    /** "My applications" — applications the current user has submitted. */
    @GetMapping("/applications/mine")
    public ResponseEntity<List<ApplicationResponse>> myApplications(
            @AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(jobService.myApplications(u.getId()));
    }

    @PatchMapping("/applications/{applicationId}/status")
    public ResponseEntity<ApplicationResponse> updateStatus(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID applicationId,
            @Valid @RequestBody UpdateApplicationStatusRequest req) {
        return ResponseEntity.ok(jobService.updateStatus(applicationId, u.getId(), req));
    }

    @DeleteMapping("/applications/{applicationId}")
    public ResponseEntity<Void> withdrawApplication(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID applicationId) {
        jobService.withdrawApplication(applicationId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobResponse> get(@AuthenticationPrincipal CustomUserDetails u,
                                            @PathVariable UUID id) {
        return ResponseEntity.ok(jobService.get(id, u == null ? null : u.getId()));
    }

    @GetMapping("/{id}/applications")
    public ResponseEntity<List<ApplicationResponse>> applications(
            @AuthenticationPrincipal CustomUserDetails u, @PathVariable UUID id) {
        return ResponseEntity.ok(jobService.applicationsFor(id, u.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<JobResponse> update(@AuthenticationPrincipal CustomUserDetails u,
                                              @PathVariable UUID id,
                                              @Valid @RequestBody UpdateJobRequest req) {
        return ResponseEntity.ok(jobService.update(id, u.getId(), req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails u,
                                       @PathVariable UUID id) {
        boolean isAdmin = u.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        jobService.delete(id, u.getId(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/apply")
    public ResponseEntity<ApplicationResponse> apply(@AuthenticationPrincipal CustomUserDetails u,
                                                     @PathVariable UUID id,
                                                     @Valid @RequestBody ApplyRequest req) {
        return ResponseEntity.status(201).body(jobService.apply(id, u.getId(), req));
    }
}
