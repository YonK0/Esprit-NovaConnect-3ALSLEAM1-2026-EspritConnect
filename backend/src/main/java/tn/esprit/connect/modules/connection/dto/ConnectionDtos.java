package tn.esprit.connect.modules.connection.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.modules.connection.entity.ConnectionStatus;

import java.time.Instant;
import java.util.UUID;

public final class ConnectionDtos {
    private ConnectionDtos() {}

    /** A connection request, optionally with a personalised message — LinkedIn-style. */
    public record CreateConnectionRequest(
            @NotNull UUID addresseeUserId,
            @Size(max = 300) String message) {}

    /** A profile we recommend the user connect with. */
    public record SuggestedConnection(
            UUID userId,
            String firstName,
            String lastName,
            String headline,
            String specialtyCode,
            Integer promotionYear,
            int sharedConnections,
            int sharedGroups,
            String reason,           // human-readable explanation of why this match
            String avatarUrl
    ) {}

    /** Status of the relationship between the viewer and another user, viewer's perspective. */
    public record ConnectionState(
            String state,       // "NONE" | "OUTGOING_PENDING" | "INCOMING_PENDING" | "ACCEPTED" | "DECLINED"
            UUID connectionId   // null when state == NONE
    ) {}

    public record ConnectionResponse(
            UUID id,
            UUID requesterUserId,
            String requesterEmail,
            String requesterName,
            String requesterAvatarUrl,
            UUID addresseeUserId,
            String addresseeEmail,
            String addresseeName,
            String addresseeAvatarUrl,
            ConnectionStatus status,
            Instant createdAt
    ) {}

    public record ConnectionCounts(long accepted, long pendingIncoming, long pendingOutgoing) {}
}
