package tn.esprit.connect.modules.feed.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.feed.dto.PostDtos.*;
import tn.esprit.connect.modules.feed.service.FeedService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/posts")
@RequiredArgsConstructor
@Tag(name = "Feed", description = "Posts, comments, reactions")
public class FeedController {

    private final FeedService feedService;

    @PostMapping
    public ResponseEntity<PostResponse> create(@AuthenticationPrincipal CustomUserDetails u,
                                               @Valid @RequestBody CreatePostRequest req) {
        return ResponseEntity.status(201).body(feedService.createPost(u.getId(), req));
    }

    @GetMapping
    public ResponseEntity<Page<PostResponse>> feed(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestParam(required = false) UUID authorId,
            Pageable pageable) {
        UUID uid = u == null ? null : u.getId();
        if (authorId != null) {
            return ResponseEntity.ok(feedService.feedByAuthor(authorId, uid, pageable));
        }
        return ResponseEntity.ok(feedService.feed(uid, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PostResponse> get(@AuthenticationPrincipal CustomUserDetails u,
                                            @PathVariable UUID id) {
        return ResponseEntity.ok(feedService.get(id, u == null ? null : u.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<PostResponse> update(@AuthenticationPrincipal CustomUserDetails u,
                                               @PathVariable UUID id,
                                               @Valid @RequestBody UpdatePostRequest req) {
        return ResponseEntity.ok(feedService.update(id, u.getId(), req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails u,
                                       @PathVariable UUID id) {
        boolean isAdmin = u.getAuthorities().stream()
                .anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        feedService.delete(id, u.getId(), isAdmin);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/comments")
    public ResponseEntity<List<CommentResponse>> comments(@PathVariable UUID id) {
        return ResponseEntity.ok(feedService.commentsFor(id));
    }

    @PostMapping("/{id}/comments")
    public ResponseEntity<CommentResponse> comment(@AuthenticationPrincipal CustomUserDetails u,
                                                   @PathVariable UUID id,
                                                   @Valid @RequestBody CommentRequest req) {
        return ResponseEntity.status(201).body(feedService.comment(id, u.getId(), req));
    }

    @PatchMapping("/comments/{commentId}")
    public ResponseEntity<CommentResponse> updateComment(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID commentId,
            @Valid @RequestBody CommentRequest req) {
        return ResponseEntity.ok(feedService.updateComment(commentId, u.getId(), req));
    }

    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID commentId) {
        feedService.deleteComment(commentId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reactions")
    public ResponseEntity<Void> react(@AuthenticationPrincipal CustomUserDetails u,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody ReactionRequest req) {
        feedService.react(id, u.getId(), req);
        return ResponseEntity.noContent().build();
    }

    /** Repost / share another user's post. Optional `commentary` rides along as caption. */
    public record RepostRequest(String commentary) {}

    @PostMapping("/{id}/repost")
    public ResponseEntity<PostResponse> repost(@AuthenticationPrincipal CustomUserDetails u,
                                                @PathVariable UUID id,
                                                @RequestBody(required = false) RepostRequest req) {
        String commentary = req == null ? "" : req.commentary();
        return ResponseEntity.status(201).body(feedService.repost(u.getId(), id, commentary));
    }

    /** Attach one image / GIF to an existing post. Call multiple times for multiple images. */
    @PostMapping(value = "/{id}/media", consumes = "multipart/form-data")
    public ResponseEntity<PostResponse> attachMedia(@AuthenticationPrincipal CustomUserDetails u,
                                                     @PathVariable UUID id,
                                                     @org.springframework.web.bind.annotation.RequestParam("file")
                                                     org.springframework.web.multipart.MultipartFile file) {
        return ResponseEntity.ok(feedService.attachMedia(u.getId(), id, file));
    }

    @DeleteMapping("/{postId}/media/{attachmentId}")
    public ResponseEntity<PostResponse> deleteMedia(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID postId,
            @PathVariable UUID attachmentId) {
        return ResponseEntity.ok(
                feedService.deleteAttachment(postId, attachmentId, u.getId()));
    }
}
