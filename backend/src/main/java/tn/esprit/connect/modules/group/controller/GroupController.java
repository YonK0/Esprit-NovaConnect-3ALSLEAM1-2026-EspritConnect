package tn.esprit.connect.modules.group.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.feed.dto.PostDtos.PostResponse;
import tn.esprit.connect.modules.feed.service.FeedService;
import tn.esprit.connect.modules.group.dto.GroupDtos.*;
import tn.esprit.connect.modules.group.service.GroupService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/groups")
@RequiredArgsConstructor
@Tag(name = "Groups")
public class GroupController {

    private final GroupService groupService;
    private final FeedService feedService;

    @PostMapping
    public ResponseEntity<GroupResponse> create(@AuthenticationPrincipal CustomUserDetails u,
                                                @Valid @RequestBody CreateGroupRequest req) {
        return ResponseEntity.status(201).body(groupService.create(u.getId(), req));
    }

    @GetMapping
    public ResponseEntity<Page<GroupResponse>> list(@AuthenticationPrincipal CustomUserDetails u,
                                                     @RequestParam(required = false) String q,
                                                     Pageable p) {
        return ResponseEntity.ok(groupService.list(u == null ? null : u.getId(), q, p));
    }

    @GetMapping("/{id}")
    public ResponseEntity<GroupResponse> get(@AuthenticationPrincipal CustomUserDetails u,
                                              @PathVariable UUID id) {
        return ResponseEntity.ok(groupService.get(id, u == null ? null : u.getId()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<GroupResponse> update(@AuthenticationPrincipal CustomUserDetails u,
                                                @PathVariable UUID id,
                                                @Valid @RequestBody UpdateGroupRequest req) {
        return ResponseEntity.ok(groupService.update(id, u.getId(), req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal CustomUserDetails u,
                                       @PathVariable UUID id) {
        groupService.delete(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<Void> join(@AuthenticationPrincipal CustomUserDetails u,
                                     @PathVariable UUID id) {
        groupService.join(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/members")
    public ResponseEntity<Void> leave(@AuthenticationPrincipal CustomUserDetails u,
                                      @PathVariable UUID id) {
        groupService.leave(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/join-request")
    public ResponseEntity<Void> cancelJoinRequest(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id) {
        groupService.cancelJoinRequest(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/members")
    public ResponseEntity<List<MemberResponse>> members(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id) {
        return ResponseEntity.ok(groupService.listMembers(id, u.getId()));
    }

    @GetMapping("/{id}/posts")
    public ResponseEntity<Page<PostResponse>> posts(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            Pageable p) {
        return ResponseEntity.ok(feedService.feedForGroup(id, u.getId(), p));
    }

    @PostMapping(value = "/{id}/cover", consumes = "multipart/form-data")
    public ResponseEntity<GroupResponse> uploadCover(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(groupService.uploadCover(id, u.getId(), file));
    }

    @PostMapping(value = "/{id}/avatar", consumes = "multipart/form-data")
    public ResponseEntity<GroupResponse> uploadAvatar(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(groupService.uploadAvatar(id, u.getId(), file));
    }

    @GetMapping("/{id}/join-requests")
    public ResponseEntity<List<JoinRequestResponse>> joinRequests(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id) {
        return ResponseEntity.ok(groupService.listJoinRequests(id, u.getId()));
    }

    @PostMapping("/join-requests/{requestId}/approve")
    public ResponseEntity<Void> approveJoinRequest(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID requestId) {
        groupService.approveJoinRequest(requestId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/join-requests/{requestId}/reject")
    public ResponseEntity<Void> rejectJoinRequest(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID requestId) {
        groupService.rejectJoinRequest(requestId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/invites")
    public ResponseEntity<InviteUsersResponse> inviteUsers(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @Valid @RequestBody InviteUsersRequest req) {
        return ResponseEntity.ok(groupService.inviteUsers(id, u.getId(), req));
    }

    @PostMapping("/invites/{inviteId}/accept")
    public ResponseEntity<Void> acceptInvite(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID inviteId) {
        groupService.acceptInvite(inviteId, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/invites/{inviteId}/decline")
    public ResponseEntity<Void> declineInvite(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID inviteId) {
        groupService.declineInvite(inviteId, u.getId());
        return ResponseEntity.noContent().build();
    }
}
