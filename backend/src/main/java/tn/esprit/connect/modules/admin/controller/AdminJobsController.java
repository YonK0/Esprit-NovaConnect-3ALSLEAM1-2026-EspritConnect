package tn.esprit.connect.modules.admin.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.admin.dto.AdminJobsDtos.AdminJobSummary;
import tn.esprit.connect.modules.admin.dto.AdminJobsDtos.EmailApplicationsRequest;
import tn.esprit.connect.modules.admin.dto.AdminJobsDtos.EmailApplicationsResult;
import tn.esprit.connect.modules.admin.service.AdminApplicationsMailService;
import tn.esprit.connect.modules.job.service.JobService.RecruiterApplicationsBundle;

import java.util.UUID;

/**
 * Admin "Job postings & applications" console (Task-3). URL-gated to ADMIN by
 * SecurityConfig ({@code /api/v1/admin/**}); the method-level annotation is
 * belt-and-suspenders and keeps the contract explicit.
 */
@RestController
@RequestMapping("/api/v1/admin/jobs")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin · Jobs")
public class AdminJobsController {

    private final AdminApplicationsMailService service;

    @GetMapping
    public ResponseEntity<Page<AdminJobSummary>> list(Pageable pageable) {
        return ResponseEntity.ok(service.listJobs(pageable));
    }

    @GetMapping("/{jobId}/applications")
    public ResponseEntity<RecruiterApplicationsBundle> applications(@PathVariable UUID jobId) {
        return ResponseEntity.ok(service.applications(jobId));
    }

    @PostMapping("/{jobId}/email-applications")
    public ResponseEntity<EmailApplicationsResult> emailApplications(
            @PathVariable UUID jobId,
            @Valid @RequestBody EmailApplicationsRequest req) {
        return ResponseEntity.ok(service.emailApplications(jobId, req.subject(), req.body()));
    }
}
