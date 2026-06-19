package tn.esprit.connect.modules.profile.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.profile.dto.RelationshipDtos.MutualConnection;
import tn.esprit.connect.modules.profile.dto.RelationshipDtos.SharedGroup;
import tn.esprit.connect.modules.profile.service.RelationshipService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles")
@RequiredArgsConstructor
@Tag(name = "Profile · relationships")
public class RelationshipController {

    private final RelationshipService svc;

    @GetMapping("/{targetUserId}/mutual-connections")
    public ResponseEntity<List<MutualConnection>> mutuals(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID targetUserId) {
        return ResponseEntity.ok(svc.mutualConnections(u.getId(), targetUserId));
    }

    @GetMapping("/{targetUserId}/shared-groups")
    public ResponseEntity<List<SharedGroup>> shared(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID targetUserId) {
        return ResponseEntity.ok(svc.sharedGroups(u.getId(), targetUserId));
    }
}
