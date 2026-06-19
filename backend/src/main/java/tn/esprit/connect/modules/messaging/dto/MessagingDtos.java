package tn.esprit.connect.modules.messaging.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class MessagingDtos {
    private MessagingDtos() {}

    public record SendMessageRequest(@NotNull UUID recipientId,
                                      @NotBlank @Size(max = 4000) String content) {}

    public record MessageResponse(UUID id, UUID conversationId, UUID senderId,
                                   String content, boolean read, Instant createdAt) {}

    public record ConversationResponse(UUID id, UUID otherUserId, String otherUserEmail,
                                        Instant lastMessageAt) {}
}
