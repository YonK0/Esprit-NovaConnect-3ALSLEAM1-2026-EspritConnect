package tn.esprit.connect.modules.resource.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.resource.dto.ResourceDtos.*;
import tn.esprit.connect.modules.resource.service.ResourceService;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

/**
 * Resources module: knowledge folders + file/link items with role-based upload
 * moderation. Moderation/management endpoints are ADMIN-gated; the PENDING/
 * REJECTED filtering happens in the service, never just in the UI.
 */
@RestController
@RequestMapping("/api/v1/resources")
@RequiredArgsConstructor
@Tag(name = "Resources")
public class ResourceController {

    private final ResourceService service;

    // ── Folders ──────────────────────────────────────────────────────────────

    @GetMapping("/folders")
    public List<FolderResponse> folders(@RequestParam(required = false) String sort,
                                        @RequestParam(required = false) String search) {
        return service.listFolders(search, sort);
    }

    @GetMapping("/folders/{id}")
    public FolderResponse folder(@PathVariable UUID id) {
        return service.getFolder(id);
    }

    @PostMapping("/folders")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<FolderResponse> createFolder(@Valid @RequestBody CreateFolderRequest req) {
        return ResponseEntity.status(201).body(service.createFolder(req));
    }

    @PutMapping("/folders/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public FolderResponse updateFolder(@PathVariable UUID id, @Valid @RequestBody CreateFolderRequest req) {
        return service.updateFolder(id, req);
    }

    @DeleteMapping("/folders/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteFolder(@PathVariable UUID id) {
        service.deleteFolder(id);
        return ResponseEntity.noContent().build();
    }

    /** Upload/replace a category cover image (admin). */
    @PostMapping(value = "/folders/{id}/cover", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public FolderResponse uploadCover(@AuthenticationPrincipal CustomUserDetails u,
                                      @PathVariable UUID id,
                                      @RequestParam("file") MultipartFile file) {
        return service.uploadCover(id, u.getId(), file);
    }

    // ── Items ────────────────────────────────────────────────────────────────

    @GetMapping("/folders/{id}/items")
    public List<ItemResponse> items(@AuthenticationPrincipal CustomUserDetails u,
                                    @PathVariable UUID id) {
        return service.listItems(id, u == null ? null : u.getId());
    }

    /** Create an upload (file or link). Status is set server-side from the role. */
    @PostMapping(value = "/folders/{id}/items", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ItemResponse> createItem(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @RequestParam("type") String type,
            @RequestParam("title") String title,
            @RequestParam(value = "url", required = false) String url,
            @RequestParam(value = "file", required = false) MultipartFile file) {
        return ResponseEntity.status(201).body(
                service.createItem(id, u.getId(), u.getUser().getRole(), type, title, url, file));
    }

    @DeleteMapping("/items/{id}")
    public ResponseEntity<Void> deleteItem(@AuthenticationPrincipal CustomUserDetails u,
                                           @PathVariable UUID id) {
        service.deleteItem(id, u.getId(), u.getUser().getRole() == Role.ADMIN);
        return ResponseEntity.noContent().build();
    }

    // ── Admin moderation ──────────────────────────────────────────────────────

    @GetMapping("/pending")
    @PreAuthorize("hasRole('ADMIN')")
    public List<PendingItemResponse> pending() {
        return service.pending();
    }

    @GetMapping("/pending/count")
    @PreAuthorize("hasRole('ADMIN')")
    public CountResponse pendingCount() {
        return new CountResponse(service.pendingCount());
    }

    @PatchMapping("/items/{id}/approve")
    @PreAuthorize("hasRole('ADMIN')")
    public ItemResponse approve(@AuthenticationPrincipal CustomUserDetails u, @PathVariable UUID id) {
        return service.approve(id, u.getId());
    }

    @PatchMapping("/items/{id}/reject")
    @PreAuthorize("hasRole('ADMIN')")
    public ItemResponse reject(@AuthenticationPrincipal CustomUserDetails u,
                               @PathVariable UUID id,
                               @RequestBody(required = false) RejectRequest req) {
        return service.reject(id, u.getId(), req == null ? null : req.rejectionReason());
    }
}
