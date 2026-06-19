package tn.esprit.connect.modules.feed.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.feed.dto.PostDtos;
import tn.esprit.connect.modules.feed.dto.PostDtos.*;
import tn.esprit.connect.modules.feed.entity.Attachment;
import tn.esprit.connect.modules.feed.entity.Comment;
import tn.esprit.connect.modules.feed.entity.Post;
import tn.esprit.connect.modules.feed.entity.Reaction;
import tn.esprit.connect.modules.feed.entity.Visibility;
import tn.esprit.connect.modules.feed.repository.AttachmentRepository;
import tn.esprit.connect.modules.feed.repository.CommentRepository;
import tn.esprit.connect.modules.feed.repository.PostRepository;
import tn.esprit.connect.modules.feed.repository.ReactionRepository;
import tn.esprit.connect.modules.group.entity.Group;
import tn.esprit.connect.modules.group.repository.GroupMemberRepository;
import tn.esprit.connect.modules.group.repository.GroupRepository;
import tn.esprit.connect.modules.badge.service.BadgeService;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.permissions.Permission;
import tn.esprit.connect.modules.permissions.PermissionService;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeedService {

    private final PostRepository postRepository;
    private final CommentRepository commentRepository;
    private final ReactionRepository reactionRepository;
    private final AttachmentRepository attachmentRepository;
    private final UserRepository userRepository;
    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final NotificationService notificationService;
    private final BadgeService badgeService;
    private final PermissionService permissionService;
    private final StorageService storageService;

    @Transactional
    public PostResponse createPost(UUID authorId, CreatePostRequest req) {
        permissionService.require(authorId, Permission.POST_CREATE);
        User author = userRepository.findById(authorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", authorId));
        Group group = null;
        if (req.groupId() != null) {
            group = groupRepository.findById(req.groupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Group", req.groupId()));
            if (!groupMemberRepository.existsByGroupIdAndUserId(group.getId(), authorId)) {
                throw new AccessDeniedException("Not a member of this group");
            }
            if (group.getModerationStatus() != tn.esprit.connect.common.moderation.ModerationStatus.APPROVED) {
                throw new BusinessException("Cannot post in a group that is not yet approved");
            }
        }
        Post post = Post.builder()
                .author(author).group(group).content(req.content()).visibility(req.visibility())
                .build();
        post = postRepository.save(post);
        badgeService.onPostCreated(authorId);
        return toDto(post, authorId);
    }

    /** Create a repost. `commentary` is the reposter's own caption,
     *  which may be empty. The new Post row points at the original via
     *  `originalPost`. */
    @Transactional
    public PostResponse repost(UUID authorId, UUID originalPostId, String commentary) {
        permissionService.require(authorId, Permission.POST_REPOST);
        User author = userRepository.findById(authorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", authorId));
        Post original = postRepository.findById(originalPostId)
                .orElseThrow(() -> new ResourceNotFoundException("Post", originalPostId));
        if (original.getAuthor().getId().equals(authorId)) {
            throw new BusinessException("You can't repost your own post — share the original instead.");
        }
        // Resolve to the true original if someone reposts a repost — keeps
        // the chain flat so the share count + UI nesting stays sensible.
        Post root = original.getOriginalPost() != null ? original.getOriginalPost() : original;

        Post repost = Post.builder()
                .author(author).content(commentary == null ? "" : commentary)
                .visibility(Visibility.NETWORK)
                .originalPost(root)
                .build();
        repost = postRepository.save(repost);

        // Notify the original author so they know their content was reshared.
        if (!root.getAuthor().getId().equals(authorId)) {
            notificationService.create(root.getAuthor().getId(), "POST_REPOST",
                    author.getEmail() + " reposted your post",
                    commentary == null || commentary.isBlank() ? null
                            : "\"" + commentary.trim() + "\"",
                    "/feed");
        }
        badgeService.onPostCreated(authorId);
        return toDto(repost, authorId);
    }

    /** Attach an uploaded image (or GIF) to an existing post the caller owns.
     *  Posts can have multiple attachments — call once per file. */
    @Transactional
    public PostResponse attachMedia(UUID userId, UUID postId, MultipartFile file) {
        Post p = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post", postId));
        if (!p.getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only the author can attach media to this post");
        }
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new BusinessException("Only image / GIF uploads are supported for post media.");
        }
        if (file.getSize() > 8 * 1024 * 1024) {
            throw new BusinessException("Post media must not exceed 8 MB.");
        }
        String url = storageService.uploadProfileFile(userId, "post-media", file);
        Attachment a = Attachment.builder()
                .post(p).fileUrl(url).mimeType(ct).sizeBytes(file.getSize())
                .build();
        attachmentRepository.save(a);
        p.getAttachments().add(a);
        return toDto(p, userId);
    }

    @Transactional(readOnly = true)
    public Page<PostResponse> feed(UUID currentUserId, Pageable pageable) {
        return postRepository.findFeed(pageable).map(p -> toDto(p, currentUserId));
    }

    @Transactional(readOnly = true)
    public Page<PostResponse> feedByAuthor(UUID authorId, UUID currentUserId, Pageable pageable) {
        return postRepository.findByAuthorId(authorId, pageable).map(p -> toDto(p, currentUserId));
    }

    /** Posts published inside a group — members only for private groups. */
    @Transactional(readOnly = true)
    public Page<PostResponse> feedForGroup(UUID groupId, UUID currentUserId, Pageable pageable) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group", groupId));
        if (group.isPrivate()) {
            boolean allowed = currentUserId != null
                    && (group.getOwner().getId().equals(currentUserId)
                        || groupMemberRepository.existsByGroupIdAndUserId(groupId, currentUserId));
            if (!allowed) {
                throw new AccessDeniedException("Only members can view this group's feed");
            }
        }
        return postRepository.findByGroupId(groupId, pageable)
                .map(p -> toDto(p, currentUserId));
    }

    @Transactional(readOnly = true)
    public PostResponse get(UUID id, UUID currentUserId) {
        return toDto(postRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Post", id)), currentUserId);
    }

    @Transactional
    public PostResponse update(UUID id, UUID userId, UpdatePostRequest req) {
        Post p = postRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Post", id));
        if (!p.getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only author can update");
        }
        if (req.content() != null) p.setContent(req.content());
        if (req.visibility() != null) p.setVisibility(req.visibility());
        return toDto(p, userId);
    }

    @Transactional
    public PostResponse deleteAttachment(UUID postId, UUID attachmentId, UUID userId) {
        Attachment a = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Attachment", attachmentId));
        if (!a.getPost().getId().equals(postId)) {
            throw new BusinessException("Attachment does not belong to this post");
        }
        if (!a.getPost().getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only the author can remove media");
        }
        a.getPost().getAttachments().remove(a);
        attachmentRepository.delete(a);
        return toDto(a.getPost(), userId);
    }

    @Transactional
    public void delete(UUID id, UUID userId, boolean isAdmin) {
        Post p = postRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Post", id));
        if (!isAdmin && !p.getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only author or admin can delete");
        }
        postRepository.delete(p);
    }

    @Transactional
    public CommentResponse comment(UUID postId, UUID authorId, CommentRequest req) {
        permissionService.require(authorId, Permission.POST_COMMENT);
        Post p = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post", postId));
        User author = userRepository.findById(authorId)
                .orElseThrow(() -> new ResourceNotFoundException("User", authorId));
        Comment c = Comment.builder().post(p).author(author).content(req.content()).build();
        c = commentRepository.save(c);
        if (!p.getAuthor().getId().equals(authorId)) {
            notificationService.create(p.getAuthor().getId(), "POST_COMMENT",
                    "New comment on your post", req.content(), "/feed/" + p.getId());
        }
        return toCommentDto(c);
    }

    @Transactional(readOnly = true)
    public List<CommentResponse> commentsFor(UUID postId) {
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId).stream()
                .map(this::toCommentDto)
                .toList();
    }

    @Transactional
    public CommentResponse updateComment(UUID commentId, UUID userId, CommentRequest req) {
        Comment c = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment", commentId));
        if (!c.getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only the author can edit this comment");
        }
        c.setContent(req.content());
        return toCommentDto(c);
    }

    @Transactional
    public void deleteComment(UUID commentId, UUID userId) {
        Comment c = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment", commentId));
        if (!c.getAuthor().getId().equals(userId)) {
            throw new AccessDeniedException("Only the author can delete this comment");
        }
        commentRepository.delete(c);
    }

    private CommentResponse toCommentDto(Comment c) {
        var cp = c.getAuthor().getProfile();
        String name = cp != null
                ? (cp.getFirstName() + " " + cp.getLastName()).trim()
                : c.getAuthor().getEmail();
        return new CommentResponse(c.getId(), c.getPost().getId(),
                c.getAuthor().getId(), name, c.getContent(), c.getCreatedAt());
    }

    @Transactional
    public void react(UUID postId, UUID userId, ReactionRequest req) {
        Post p = postRepository.findById(postId)
                .orElseThrow(() -> new ResourceNotFoundException("Post", postId));
        var existing = reactionRepository.findByPostIdAndUserId(postId, userId);
        if (existing.isPresent()) {
            Reaction r = existing.get();
            if (r.getType() == req.type()) {
                reactionRepository.delete(r); // toggle off
                return;
            }
            r.setType(req.type());
            return;
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        reactionRepository.save(Reaction.builder().post(p).user(user).type(req.type()).build());
        if (!p.getAuthor().getId().equals(userId)) {
            var profile = user.getProfile();
            String reactor = profile != null
                    ? (profile.getFirstName() + " " + profile.getLastName()).trim()
                    : user.getEmail();
            notificationService.create(p.getAuthor().getId(),
                    "POST_REACTION",
                    reactor + " reacted to your post",
                    null,
                    "/feed");
        }
    }

    private PostResponse toDto(Post p, UUID currentUserId) {
        return toDto(p, currentUserId, true);
    }

    /** Build a DTO. `includeOriginal` is false for the nested original-post
     *  DTO inside a repost — prevents infinite recursion if some future
     *  bug ever lets a repost reference itself. */
    private PostResponse toDto(Post p, UUID currentUserId, boolean includeOriginal) {
        long reactions = reactionRepository.countByPostId(p.getId());
        long comments = commentRepository.countByPostId(p.getId());
        long shareCount = postRepository.countByOriginalPostId(p.getId());
        var myReaction = currentUserId == null ? null
                : reactionRepository.findByPostIdAndUserId(p.getId(), currentUserId)
                        .map(Reaction::getType).orElse(null);
        var profile = p.getAuthor().getProfile();
        String authorName = profile != null
                ? (profile.getFirstName() + " " + profile.getLastName()).trim()
                : p.getAuthor().getEmail();
        String authorAvatar = profile == null ? null : profile.getAvatarUrl();

        List<PostDtos.MediaAttachment> media = p.getAttachments() == null
                ? List.of()
                : p.getAttachments().stream()
                    .map(a -> new PostDtos.MediaAttachment(
                            a.getId(), a.getFileUrl(), a.getMimeType()))
                    .toList();

        PostResponse originalDto = (includeOriginal && p.getOriginalPost() != null)
                ? toDto(p.getOriginalPost(), currentUserId, false)
                : null;
        UUID originalId = p.getOriginalPost() == null ? null : p.getOriginalPost().getId();

        return new PostResponse(
                p.getId(), p.getAuthor().getId(), authorName, authorAvatar,
                p.getGroup() == null ? null : p.getGroup().getId(),
                p.getContent(), p.getVisibility(),
                media, originalId, originalDto,
                reactions, comments, shareCount,
                myReaction,
                p.getCreatedAt());
    }
}
