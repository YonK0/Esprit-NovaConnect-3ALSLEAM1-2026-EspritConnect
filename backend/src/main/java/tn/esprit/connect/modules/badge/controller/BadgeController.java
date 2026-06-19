package tn.esprit.connect.modules.badge.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.badge.service.BadgeService;
import tn.esprit.connect.modules.badge.service.BadgeService.BadgeDto;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/badges")
@RequiredArgsConstructor
@Tag(name = "Badges")
public class BadgeController {

    private final BadgeService badgeService;

    @GetMapping("/me")
    public ResponseEntity<List<BadgeDto>> mine(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(badgeService.badgesFor(u.getId()));
    }

    @GetMapping("/{userId}")
    public ResponseEntity<List<BadgeDto>> forUser(@PathVariable UUID userId) {
        return ResponseEntity.ok(badgeService.badgesFor(userId));
    }
}
