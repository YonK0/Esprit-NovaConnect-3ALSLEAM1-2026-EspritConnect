package tn.esprit.connect.modules.notification.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.notification.dto.NotificationResponse;
import tn.esprit.connect.modules.notification.entity.Notification;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications")
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public ResponseEntity<Page<NotificationResponse>> list(
            @AuthenticationPrincipal CustomUserDetails u, Pageable pageable) {
        return ResponseEntity.ok(notificationService.list(u.getId(), pageable).map(this::toDto));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Long> unreadCount(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(notificationService.unreadCount(u.getId()));
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@AuthenticationPrincipal CustomUserDetails u,
                                         @PathVariable UUID id) {
        notificationService.markRead(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/read-all")
    public ResponseEntity<Integer> markAllRead(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(notificationService.markAllRead(u.getId()));
    }

    private NotificationResponse toDto(Notification n) {
        return new NotificationResponse(n.getId(), n.getType(), n.getTitle(), n.getBody(),
                n.getLink(), n.isRead(), n.getCreatedAt());
    }
}
