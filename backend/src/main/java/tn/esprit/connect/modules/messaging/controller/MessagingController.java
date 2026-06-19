package tn.esprit.connect.modules.messaging.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.messaging.dto.MessagingDtos.*;
import tn.esprit.connect.modules.messaging.service.MessagingService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/messaging")
@RequiredArgsConstructor
@Tag(name = "Messaging")
public class MessagingController {

    private final MessagingService messagingService;

    @PostMapping("/messages")
    public ResponseEntity<MessageResponse> send(@AuthenticationPrincipal CustomUserDetails u,
                                                @Valid @RequestBody SendMessageRequest req) {
        return ResponseEntity.status(201).body(messagingService.send(u.getId(), req));
    }

    /**
     * Find or create a 1:1 conversation with another user, return its id.
     * Used by the "Message" button on profile and directory cards.
     */
    @PostMapping("/conversations/with/{userId}")
    public ResponseEntity<ConversationIdResponse> findOrCreate(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID userId) {
        return ResponseEntity.ok(new ConversationIdResponse(
                messagingService.findOrCreateConversation(u.getId(), userId)));
    }

    public record ConversationIdResponse(UUID conversationId) {}

    @GetMapping("/conversations")
    public ResponseEntity<List<ConversationResponse>> mine(@AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(messagingService.myConversations(u.getId()));
    }

    @GetMapping("/conversations/{id}/messages")
    public ResponseEntity<List<MessageResponse>> messages(@AuthenticationPrincipal CustomUserDetails u,
                                                          @PathVariable UUID id) {
        return ResponseEntity.ok(messagingService.messages(id, u.getId()));
    }

    @PostMapping("/conversations/{id}/read")
    public ResponseEntity<Void> markRead(@AuthenticationPrincipal CustomUserDetails u,
                                         @PathVariable UUID id) {
        messagingService.markRead(id, u.getId());
        return ResponseEntity.noContent().build();
    }
}
