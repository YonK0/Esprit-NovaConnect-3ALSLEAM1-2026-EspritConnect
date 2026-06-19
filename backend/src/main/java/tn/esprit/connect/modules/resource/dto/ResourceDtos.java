package tn.esprit.connect.modules.resource.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

/** Request/response payloads for the Resources module. */
public final class ResourceDtos {

    private ResourceDtos() {}

    public record FolderResponse(
            UUID id,
            String title,
            String description,
            String coverImageUrl,
            String ownerAvatarUrl,
            long itemCount,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record ItemResponse(
            UUID id,
            UUID folderId,
            String type,
            String title,
            String url,
            String fileType,
            Long size,
            String status,
            UUID submittedBy,
            String submittedByName,
            String rejectionReason,
            Instant createdAt,
            Instant reviewedAt,
            /** True when this is the calling user's own still-PENDING upload. */
            boolean ownPending
    ) {}

    /** Admin review-queue row. */
    public record PendingItemResponse(
            UUID id,
            UUID folderId,
            String folderTitle,
            String title,
            String type,
            String url,
            String submitterName,
            Instant createdAt
    ) {}

    public record CreateFolderRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 2000) String description,
            String coverImageUrl
    ) {}

    public record RejectRequest(@Size(max = 1000) String rejectionReason) {}

    public record CountResponse(long count) {}
}
