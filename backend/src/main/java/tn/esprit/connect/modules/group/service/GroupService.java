package tn.esprit.connect.modules.group.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.group.dto.GroupDtos.*;
import tn.esprit.connect.modules.group.entity.*;
import tn.esprit.connect.modules.group.repository.GroupInviteRepository;
import tn.esprit.connect.modules.group.repository.GroupJoinRequestRepository;
import tn.esprit.connect.modules.group.repository.GroupMemberRepository;
import tn.esprit.connect.modules.group.repository.GroupRepository;
import tn.esprit.connect.modules.badge.service.BadgeService;
import tn.esprit.connect.modules.feed.repository.PostRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.permissions.Permission;
import tn.esprit.connect.modules.permissions.PermissionService;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GroupService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository memberRepository;
    private final GroupJoinRequestRepository joinRequestRepository;
    private final GroupInviteRepository inviteRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final PermissionService permissionService;
    private final BadgeService badgeService;
    private final PostRepository postRepository;
    private final StorageService storageService;

    @Transactional
    public GroupResponse create(UUID ownerId, CreateGroupRequest req) {
        permissionService.require(ownerId, Permission.GROUP_CREATE);
        User owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User", ownerId));
        Group g = Group.builder()
                .name(req.name()).type(req.type()).description(req.description())
                .isPrivate(req.isPrivate()).coverUrl(req.coverUrl()).owner(owner)
                .build();
        g = groupRepository.save(g);
        memberRepository.save(GroupMember.builder()
                .group(g).user(owner).role(MemberRole.OWNER).joinedAt(Instant.now()).build());
        return toDto(g, ownerId);
    }

    @Transactional(readOnly = true)
    public Page<GroupResponse> list(UUID viewerId, String query, Pageable pageable) {
        String q = query == null ? "" : query.trim();
        return groupRepository.findVisibleTo(viewerId, q.isEmpty() ? null : q, pageable)
                .map(g -> toDto(g, viewerId));
    }

    @Transactional(readOnly = true)
    public GroupResponse get(UUID id, UUID viewerId) {
        Group g = groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Group", id));
        ensureVisible(g, viewerId);
        return toDto(g, viewerId);
    }

    @Transactional
    public GroupResponse update(UUID id, UUID userId, UpdateGroupRequest req) {
        Group g = mustBeOwner(id, userId);
        if (req.name() != null) g.setName(req.name());
        if (req.description() != null) g.setDescription(req.description());
        if (req.isPrivate() != null) g.setPrivate(req.isPrivate());
        if (req.coverUrl() != null) g.setCoverUrl(req.coverUrl());
        return toDto(g, userId);
    }

    @Transactional
    public void delete(UUID id, UUID userId) {
        Group g = mustBeOwner(id, userId);
        groupRepository.delete(g);
    }

    @Transactional
    public void join(UUID groupId, UUID userId) {
        permissionService.require(userId, Permission.GROUP_JOIN);
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group", groupId));
        if (g.getModerationStatus() != ModerationStatus.APPROVED) {
            throw new BusinessException("Group is not open for membership yet");
        }
        if (memberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new BusinessException("Already a member");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        if (g.isPrivate()) {
            var existing = joinRequestRepository.findByGroupIdAndUserId(groupId, userId);
            if (existing.isPresent()) {
                JoinRequestStatus s = existing.get().getStatus();
                if (s == JoinRequestStatus.PENDING) {
                    throw new BusinessException("Join request already pending");
                }
                if (s == JoinRequestStatus.REJECTED || s == JoinRequestStatus.APPROVED) {
                    GroupJoinRequest req = existing.get();
                    req.setStatus(JoinRequestStatus.PENDING);
                    req.setDecidedAt(null);
                    req.setDecidedBy(null);
                    notifyOwnerOfJoinRequest(g, user);
                    return;
                }
            }
            joinRequestRepository.save(GroupJoinRequest.builder()
                    .group(g).user(user).status(JoinRequestStatus.PENDING).build());
            notifyOwnerOfJoinRequest(g, user);
            return;
        }

        addMember(g, user);
        badgeService.onGroupJoined(userId, memberRepository.countByUserId(userId));
    }

    @Transactional
    public void cancelJoinRequest(UUID groupId, UUID userId) {
        GroupJoinRequest req = joinRequestRepository.findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupJoinRequest", groupId));
        if (req.getStatus() != JoinRequestStatus.PENDING) {
            throw new BusinessException("No pending join request to cancel");
        }
        if (!req.getUser().getId().equals(userId)) {
            throw new AccessDeniedException("You can only cancel your own join request");
        }
        joinRequestRepository.delete(req);
    }

    @Transactional
    public void leave(UUID groupId, UUID userId) {
        GroupMember m = memberRepository.findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupMember", groupId));
        if (m.getRole() == MemberRole.OWNER) {
            throw new BusinessException("Owner cannot leave; delete the group instead");
        }
        memberRepository.delete(m);
    }

    @Transactional(readOnly = true)
    public List<MemberResponse> listMembers(UUID groupId, UUID viewerId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group", groupId));
        ensureVisible(g, viewerId);
        if (!canViewContent(g, viewerId)) {
            return List.of(toMemberDto(findOwnerMembership(g)));
        }
        return memberRepository.findByGroupIdOrderByRoleAscJoinedAtAsc(groupId).stream()
                .map(this::toMemberDto)
                .toList();
    }

    @Transactional
    public GroupResponse uploadCover(UUID groupId, UUID userId, MultipartFile file) {
        Group g = mustBeOwner(groupId, userId);
        validateImage(file);
        g.setCoverUrl(storageService.uploadProfileFile(g.getId(), "group-cover", file));
        return toDto(g, userId);
    }

    @Transactional
    public GroupResponse uploadAvatar(UUID groupId, UUID userId, MultipartFile file) {
        Group g = mustBeOwner(groupId, userId);
        validateImage(file);
        g.setAvatarUrl(storageService.uploadProfileFile(g.getId(), "group-avatar", file));
        return toDto(g, userId);
    }

    @Transactional(readOnly = true)
    public List<JoinRequestResponse> listJoinRequests(UUID groupId, UUID requesterId) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group", groupId));
        if (!g.getOwner().getId().equals(requesterId)) {
            throw new AccessDeniedException("Only the group owner can view join requests");
        }
        return joinRequestRepository
                .findByGroupIdAndStatusOrderByCreatedAtDesc(groupId, JoinRequestStatus.PENDING)
                .stream()
                .map(this::toJoinRequestDto)
                .toList();
    }

    @Transactional
    public void approveJoinRequest(UUID requestId, UUID ownerId) {
        GroupJoinRequest req = joinRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupJoinRequest", requestId));
        Group g = req.getGroup();
        if (!g.getOwner().getId().equals(ownerId)) {
            throw new AccessDeniedException("Only the group owner can approve join requests");
        }
        if (req.getStatus() != JoinRequestStatus.PENDING) {
            throw new BusinessException("Request is no longer pending");
        }
        if (memberRepository.existsByGroupIdAndUserId(g.getId(), req.getUser().getId())) {
            req.setStatus(JoinRequestStatus.APPROVED);
            req.setDecidedAt(Instant.now());
            req.setDecidedBy(userRepository.getReferenceById(ownerId));
            return;
        }
        req.setStatus(JoinRequestStatus.APPROVED);
        req.setDecidedAt(Instant.now());
        req.setDecidedBy(userRepository.getReferenceById(ownerId));
        addMember(g, req.getUser());
        badgeService.onGroupJoined(req.getUser().getId(),
                memberRepository.countByUserId(req.getUser().getId()));
        notificationService.create(req.getUser().getId(), "GROUP_JOIN_APPROVED",
                "Welcome to " + g.getName(),
                "Your request to join was approved.",
                "/groups/" + g.getId());
    }

    @Transactional
    public void rejectJoinRequest(UUID requestId, UUID ownerId) {
        GroupJoinRequest req = joinRequestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupJoinRequest", requestId));
        Group g = req.getGroup();
        if (!g.getOwner().getId().equals(ownerId)) {
            throw new AccessDeniedException("Only the group owner can reject join requests");
        }
        if (req.getStatus() != JoinRequestStatus.PENDING) {
            throw new BusinessException("Request is no longer pending");
        }
        req.setStatus(JoinRequestStatus.REJECTED);
        req.setDecidedAt(Instant.now());
        req.setDecidedBy(userRepository.getReferenceById(ownerId));
        notificationService.create(req.getUser().getId(), "GROUP_JOIN_REJECTED",
                "Request declined for " + g.getName(),
                "The group owner did not approve your request.",
                "/groups/" + g.getId());
    }

    @Transactional
    public InviteUsersResponse inviteUsers(UUID groupId, UUID inviterId, InviteUsersRequest req) {
        Group g = groupRepository.findById(groupId)
                .orElseThrow(() -> new ResourceNotFoundException("Group", groupId));
        if (g.getModerationStatus() != ModerationStatus.APPROVED) {
            throw new BusinessException("Group is not open for invitations yet");
        }
        if (!memberRepository.existsByGroupIdAndUserId(groupId, inviterId)) {
            throw new AccessDeniedException("Only members can invite others");
        }
        User inviter = userRepository.findById(inviterId)
                .orElseThrow(() -> new ResourceNotFoundException("User", inviterId));
        int sent = 0;
        int skipped = 0;
        for (UUID targetId : req.userIds()) {
            if (targetId.equals(inviterId)
                    || memberRepository.existsByGroupIdAndUserId(groupId, targetId)) {
                skipped++;
                continue;
            }
            User target = userRepository.findById(targetId).orElse(null);
            if (target == null) {
                skipped++;
                continue;
            }
            var existing = inviteRepository.findByGroupIdAndInvitedUserId(groupId, targetId);
            if (existing.isPresent() && existing.get().getStatus() == InviteStatus.PENDING) {
                skipped++;
                continue;
            }
            GroupInvite invite = existing.orElseGet(() -> GroupInvite.builder()
                    .group(g).invitedUser(target).invitedBy(inviter).build());
            invite.setInvitedBy(inviter);
            invite.setStatus(InviteStatus.PENDING);
            invite.setDecidedAt(null);
            inviteRepository.save(invite);
            String inviterName = displayName(inviter);
            notificationService.create(targetId, "GROUP_INVITE",
                    "Invitation to " + g.getName(),
                    inviterName + " invited you to join this group.",
                    "/groups/" + g.getId());
            sent++;
        }
        return new InviteUsersResponse(sent, skipped);
    }

    @Transactional
    public void acceptInvite(UUID inviteId, UUID userId) {
        GroupInvite invite = inviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupInvite", inviteId));
        if (!invite.getInvitedUser().getId().equals(userId)) {
            throw new AccessDeniedException("This invitation is not for you");
        }
        if (invite.getStatus() != InviteStatus.PENDING) {
            throw new BusinessException("Invitation is no longer pending");
        }
        Group g = invite.getGroup();
        if (g.getModerationStatus() != ModerationStatus.APPROVED) {
            throw new BusinessException("Group is not open for membership");
        }
        invite.setStatus(InviteStatus.ACCEPTED);
        invite.setDecidedAt(Instant.now());
        if (!memberRepository.existsByGroupIdAndUserId(g.getId(), userId)) {
            addMember(g, invite.getInvitedUser());
            badgeService.onGroupJoined(userId, memberRepository.countByUserId(userId));
        }
        String inviteeName = displayName(invite.getInvitedUser());
        notificationService.create(invite.getInvitedBy().getId(), "GROUP_INVITE_ACCEPTED",
                "Invitation accepted — " + g.getName(),
                inviteeName + " accepted your invitation and joined the group.",
                "/groups/" + g.getId());
    }

    @Transactional
    public void declineInvite(UUID inviteId, UUID userId) {
        GroupInvite invite = inviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("GroupInvite", inviteId));
        if (!invite.getInvitedUser().getId().equals(userId)) {
            throw new AccessDeniedException("This invitation is not for you");
        }
        if (invite.getStatus() != InviteStatus.PENDING) {
            throw new BusinessException("Invitation is no longer pending");
        }
        invite.setStatus(InviteStatus.DECLINED);
        invite.setDecidedAt(Instant.now());
        Group g = invite.getGroup();
        String inviteeName = displayName(invite.getInvitedUser());
        notificationService.create(invite.getInvitedBy().getId(), "GROUP_INVITE_DECLINED",
                "Invitation declined — " + g.getName(),
                inviteeName + " declined your invitation to join the group.",
                "/groups/" + g.getId());
    }

    private void addMember(Group g, User user) {
        memberRepository.save(GroupMember.builder()
                .group(g).user(user).role(MemberRole.MEMBER).joinedAt(Instant.now()).build());
    }

    private void notifyOwnerOfJoinRequest(Group g, User requester) {
        String name = displayName(requester);
        notificationService.create(g.getOwner().getId(), "GROUP_JOIN_REQUEST",
                "Join request for " + g.getName(),
                name + " wants to join your private group.",
                "/groups/" + g.getId());
    }

    private JoinRequestResponse toJoinRequestDto(GroupJoinRequest r) {
        User u = r.getUser();
        return new JoinRequestResponse(r.getId(), u.getId(), u.getEmail(),
                displayName(u), r.getStatus(), r.getCreatedAt());
    }

    private String displayName(User u) {
        var p = u.getProfile();
        if (p != null) {
            String name = (p.getFirstName() + " " + p.getLastName()).trim();
            if (!name.isBlank()) return name;
        }
        return u.getEmail();
    }

    private void ensureVisible(Group g, UUID viewerId) {
        if (g.getModerationStatus() == ModerationStatus.APPROVED) return;
        if (viewerId != null && g.getOwner().getId().equals(viewerId)) return;
        throw new ResourceNotFoundException("Group", g.getId());
    }

    private Group mustBeOwner(UUID id, UUID userId) {
        Group g = groupRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Group", id));
        if (!g.getOwner().getId().equals(userId)) {
            throw new AccessDeniedException("Only owner can perform this action");
        }
        return g;
    }

    boolean canViewContent(Group g, UUID viewerId) {
        if (viewerId != null && g.getOwner().getId().equals(viewerId)) return true;
        if (!g.isPrivate()) return true;
        return viewerId != null
                && memberRepository.existsByGroupIdAndUserId(g.getId(), viewerId);
    }

    private GroupMember findOwnerMembership(Group g) {
        return memberRepository.findByGroupIdAndUserId(g.getId(), g.getOwner().getId())
                .orElseThrow(() -> new ResourceNotFoundException("GroupMember", g.getId()));
    }

    private MemberResponse toMemberDto(GroupMember m) {
        User u = m.getUser();
        var p = u.getProfile();
        String name = displayName(u);
        String headline = p != null && p.getHeadline() != null ? p.getHeadline() : "";
        String avatar = p != null ? p.getAvatarUrl() : null;
        return new MemberResponse(u.getId(), name, u.getEmail(), avatar, headline,
                m.getRole(), m.getJoinedAt());
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Cannot upload an empty file");
        }
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new BusinessException("Only image files are supported.");
        }
        if (file.getSize() > 8 * 1024 * 1024) {
            throw new BusinessException("Image must not exceed 8 MB.");
        }
    }

    private GroupResponse toDto(Group g, UUID viewerId) {
        boolean isMember = viewerId != null
                && memberRepository.existsByGroupIdAndUserId(g.getId(), viewerId);
        boolean isOwner = viewerId != null && g.getOwner().getId().equals(viewerId);
        boolean canView = canViewContent(g, viewerId);
        boolean hasPendingRequest = viewerId != null
                && joinRequestRepository.existsByGroupIdAndUserIdAndStatus(
                        g.getId(), viewerId, JoinRequestStatus.PENDING);
        UUID pendingInviteId = null;
        boolean hasPendingInvite = false;
        if (viewerId != null) {
            var pendingInvite = inviteRepository.findByGroupIdAndInvitedUserIdAndStatus(
                    g.getId(), viewerId, InviteStatus.PENDING);
            if (pendingInvite.isPresent()) {
                hasPendingInvite = true;
                pendingInviteId = pendingInvite.get().getId();
            }
        }
        String description = g.getDescription();
        if (!canView) {
            description = null;
        }
        User owner = g.getOwner();
        var ownerProfile = owner.getProfile();
        String ownerAvatar = ownerProfile != null ? ownerProfile.getAvatarUrl() : null;
        return new GroupResponse(g.getId(), g.getName(), g.getType(), description,
                g.isPrivate(), g.getCoverUrl(), g.getAvatarUrl(),
                owner.getId(), displayName(owner), ownerAvatar,
                memberRepository.countByGroupId(g.getId()),
                postRepository.countByGroupIdAndDeletedAtIsNull(g.getId()),
                isMember, isOwner, canView, hasPendingRequest,
                hasPendingInvite, pendingInviteId,
                g.getModerationStatus(), g.getCreatedAt());
    }
}
