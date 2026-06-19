package tn.esprit.connect.modules.connection.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.connection.dto.ConnectionDtos.*;
import tn.esprit.connect.modules.connection.service.ConnectionService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/connections")
@RequiredArgsConstructor
@Tag(name = "Connections")
public class ConnectionController {

    private final ConnectionService service;

    @PostMapping
    @Operation(summary = "Send a connection request (optionally with a personal note)")
    public ResponseEntity<ConnectionResponse> request(
            @AuthenticationPrincipal CustomUserDetails u,
            @Valid @RequestBody CreateConnectionRequest req) {
        return ResponseEntity.status(201).body(
                service.request(u.getId(), req.addresseeUserId(), req.message()));
    }

    @GetMapping("/suggestions")
    @Operation(summary = "People you may know — scored by promo, specialty, mutual connections, shared groups")
    public ResponseEntity<List<SuggestedConnection>> suggestions(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(service.peopleYouMayKnow(u.getId(), Math.min(50, Math.max(1, limit))));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<ConnectionResponse> accept(@AuthenticationPrincipal CustomUserDetails u,
                                                     @PathVariable UUID id) {
        return ResponseEntity.ok(service.accept(u.getId(), id));
    }

    @PostMapping("/{id}/decline")
    public ResponseEntity<ConnectionResponse> decline(@AuthenticationPrincipal CustomUserDetails u,
                                                      @PathVariable UUID id) {
        return ResponseEntity.ok(service.decline(u.getId(), id));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Cancel a pending request (requester only)")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal CustomUserDetails u,
                                       @PathVariable UUID id) {
        service.cancel(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/state/{otherUserId}")
    @Operation(summary = "Connection state between viewer and another user")
    public ResponseEntity<ConnectionState> state(@AuthenticationPrincipal CustomUserDetails u,
                                                 @PathVariable UUID otherUserId) {
        return ResponseEntity.ok(service.stateBetween(u.getId(), otherUserId));
    }

    @GetMapping("/incoming")
    public ResponseEntity<List<ConnectionResponse>> incoming(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(service.incomingPending(u.getId()));
    }

    @GetMapping("/outgoing")
    public ResponseEntity<List<ConnectionResponse>> outgoing(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(service.outgoingPending(u.getId()));
    }

    @GetMapping("/accepted")
    public ResponseEntity<List<ConnectionResponse>> accepted(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(service.accepted(u.getId()));
    }

    @GetMapping("/counts")
    public ResponseEntity<ConnectionCounts> counts(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(service.counts(u.getId()));
    }
}
