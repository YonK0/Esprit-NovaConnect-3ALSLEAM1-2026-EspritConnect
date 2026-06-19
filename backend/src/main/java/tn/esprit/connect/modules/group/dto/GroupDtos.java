package tn.esprit.connect.modules.group.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.group.entity.GroupType;
import tn.esprit.connect.modules.group.entity.JoinRequestStatus;
import tn.esprit.connect.modules.group.entity.MemberRole;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GroupDtos {
    private GroupDtos() {}

    public record CreateGroupRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull GroupType type,
            @Size(max = 2000) String description,
            boolean isPrivate,
            String coverUrl) {}

    public record UpdateGroupRequest(
            @Size(max = 120) String name,
            @Size(max = 2000) String description,
            Boolean isPrivate,
            String coverUrl) {}

    public record GroupResponse(UUID id, String name, GroupType type, String description,
                                 boolean isPrivate, String coverUrl, String avatarUrl,
                                 UUID ownerId, String ownerName, String ownerAvatarUrl,
                                 long memberCount, long postCount,
                                 boolean isMember, boolean isOwner, boolean canViewContent,
                                 boolean hasPendingRequest,
                                 boolean hasPendingInvite,
                                 UUID pendingInviteId,
                                 ModerationStatus moderationStatus,
                                 Instant createdAt) {}

    public record InviteUsersRequest(@NotNull List<UUID> userIds) {}

    public record InviteUsersResponse(int sent, int skipped) {}

    public record JoinRequestResponse(UUID id, UUID userId, String email, String name,
                                     JoinRequestStatus status, Instant createdAt) {}

    public record MemberResponse(UUID userId, String name, String email, String avatarUrl,
                                  String headline, MemberRole role, Instant joinedAt) {}
}
