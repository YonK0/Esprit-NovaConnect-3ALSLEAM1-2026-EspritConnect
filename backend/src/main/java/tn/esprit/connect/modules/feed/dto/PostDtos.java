package tn.esprit.connect.modules.feed.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import tn.esprit.connect.modules.feed.entity.ReactionType;
import tn.esprit.connect.modules.feed.entity.Visibility;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PostDtos {
    private PostDtos() {}

    public record CreatePostRequest(
            @NotBlank @Size(max = 8000) String content,
            @NotNull Visibility visibility,
            UUID groupId
    ) {}

    public record UpdatePostRequest(
            @Size(max = 8000) String content,
            Visibility visibility
    ) {}

    public record MediaAttachment(UUID id, String url, String mimeType) {}

    public record PostResponse(
            UUID id, UUID authorId, String authorName, String authorAvatarUrl,
            UUID groupId,
            String content, Visibility visibility,
            List<MediaAttachment> media,    // image / gif urls
            UUID originalPostId,            // non-null when this row is a repost
            PostResponse originalPost,      // populated when this row is a repost (recursive shallow)
            long reactionCount, long commentCount, long shareCount,
            ReactionType myReactionType,
            Instant createdAt
    ) {}

    public record CommentRequest(@NotBlank @Size(max = 4000) String content) {}

    public record CommentResponse(UUID id, UUID postId, UUID authorId, String authorName,
                                   String content, Instant createdAt) {}

    public record ReactionRequest(@NotNull ReactionType type) {}
}
