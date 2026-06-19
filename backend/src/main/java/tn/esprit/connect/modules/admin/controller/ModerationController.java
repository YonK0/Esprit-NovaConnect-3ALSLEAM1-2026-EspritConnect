package tn.esprit.connect.modules.admin.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.admin.dto.ModerationDtos.ModerationItem;
import tn.esprit.connect.modules.admin.service.ModerationService;
import tn.esprit.connect.modules.admin.service.ModerationService.ContentType;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/moderation")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
@Tag(name = "Admin · Moderation")
public class ModerationController {

    private final ModerationService moderationService;

    @GetMapping("/{type}")
    public ResponseEntity<Page<ModerationItem>> list(
            @PathVariable ContentType type,
            @RequestParam(defaultValue = "PENDING") ModerationStatus status,
            Pageable pageable) {
        return ResponseEntity.ok(moderationService.list(type, status, pageable));
    }

    @PostMapping("/{type}/{id}/approve")
    public ResponseEntity<Void> approve(@AuthenticationPrincipal CustomUserDetails admin,
                                        @PathVariable ContentType type,
                                        @PathVariable UUID id) {
        moderationService.approve(type, id, admin.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{type}/{id}/reject")
    public ResponseEntity<Void> reject(@AuthenticationPrincipal CustomUserDetails admin,
                                       @PathVariable ContentType type,
                                       @PathVariable UUID id,
                                       @RequestParam(required = false) String reason) {
        moderationService.reject(type, id, admin.getId(), reason);
        return ResponseEntity.noContent().build();
    }
}
