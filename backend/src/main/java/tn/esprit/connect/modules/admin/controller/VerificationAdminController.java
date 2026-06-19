package tn.esprit.connect.modules.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.admin.dto.VerificationAdminDtos.*;
import tn.esprit.connect.modules.admin.service.VerificationAdminService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/verifications")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin · Verifications")
public class VerificationAdminController {

    private final VerificationAdminService service;

    @GetMapping
    @Operation(summary = "List users awaiting admin decision (paged).")
    public ResponseEntity<Page<PendingVerification>> list(Pageable pageable) {
        return ResponseEntity.ok(service.list(pageable));
    }

    @GetMapping("/{userId}")
    @Operation(summary = "Full audit chain for a single user.")
    public ResponseEntity<VerificationDetail> detail(@PathVariable UUID userId) {
        return ResponseEntity.ok(service.detail(userId));
    }

    @PostMapping("/{userId}/approve")
    @Operation(summary = "Approve the registration: user → ACTIVE + welcome notification.")
    public ResponseEntity<Void> approve(@AuthenticationPrincipal CustomUserDetails admin,
                                        @PathVariable UUID userId) {
        service.approve(userId, admin.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{userId}/reject")
    @Operation(summary = "Reject the registration: user → SUSPENDED + reason notification.")
    public ResponseEntity<Void> reject(@AuthenticationPrincipal CustomUserDetails admin,
                                       @PathVariable UUID userId,
                                       @Valid @RequestBody RejectRequest req) {
        service.reject(userId, admin.getId(), req.reason());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{userId}/acknowledge")
    @Operation(summary = "Acknowledge an admin-requested identity re-verification (clears it from the queue).")
    public ResponseEntity<Void> acknowledge(@AuthenticationPrincipal CustomUserDetails admin,
                                            @PathVariable UUID userId) {
        service.acknowledge(userId, admin.getId());
        return ResponseEntity.noContent().build();
    }
}
