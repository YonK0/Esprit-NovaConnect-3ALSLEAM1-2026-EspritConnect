package tn.esprit.connect.modules.connection.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.connection.dto.ConnectionDtos.*;
import tn.esprit.connect.modules.connection.entity.Connection;
import tn.esprit.connect.modules.connection.entity.ConnectionStatus;
import tn.esprit.connect.modules.connection.repository.ConnectionRepository;
import tn.esprit.connect.modules.badge.service.BadgeService;
import tn.esprit.connect.modules.group.repository.GroupMemberRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ConnectionService {

    private final ConnectionRepository connectionRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final BadgeService badgeService;
    private final ProfileRepository profileRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final tn.esprit.connect.modules.permissions.PermissionService permissionService;

    /** Send a connection request, optionally with a short personal note.
     *  Idempotent if one already exists. */
    @Transactional
    public ConnectionResponse request(UUID viewerId, UUID addresseeUserId, String message) {
        permissionService.require(viewerId,
                tn.esprit.connect.modules.permissions.Permission.CONNECTION_REQUEST);
        if (viewerId.equals(addresseeUserId)) {
            throw new BusinessException("Cannot connect with yourself");
        }
        Connection existing = connectionRepository.findBetween(viewerId, addresseeUserId).orElse(null);
        if (existing != null) {
            if (existing.getStatus() == ConnectionStatus.ACCEPTED) {
                throw new BusinessException("Already connected");
            }
            if (existing.getStatus() == ConnectionStatus.PENDING) {
                // Someone already opened a thread — return it instead of creating a duplicate.
                return toDto(existing);
            }
            // DECLINED or CANCELLED → allow a fresh request by reusing the row
            existing.setRequester(userOrThrow(viewerId));
            existing.setAddressee(userOrThrow(addresseeUserId));
            existing.setStatus(ConnectionStatus.PENDING);
            notifyIncoming(existing, message);
            return toDto(existing);
        }
        Connection c = Connection.builder()
                .requester(userOrThrow(viewerId))
                .addressee(userOrThrow(addresseeUserId))
                .status(ConnectionStatus.PENDING)
                .build();
        c = connectionRepository.save(c);
        notifyIncoming(c, message);
        return toDto(c);
    }

    @Transactional
    public ConnectionResponse accept(UUID viewerId, UUID connectionId) {
        Connection c = mustExist(connectionId);
        if (!c.getAddressee().getId().equals(viewerId)) {
            throw new AccessDeniedException("Only the addressee can accept");
        }
        if (c.getStatus() != ConnectionStatus.PENDING) {
            throw new BusinessException("Not a pending request");
        }
        c.setStatus(ConnectionStatus.ACCEPTED);
        notificationService.create(c.getRequester().getId(),
                "CONNECTION_ACCEPTED",
                c.getAddressee().getEmail() + " accepted your connection request",
                "You are now connected.",
                "/profiles/" + c.getAddressee().getId());
        badgeService.onConnectionAccepted(c.getRequester().getId());
        badgeService.onConnectionAccepted(c.getAddressee().getId());
        return toDto(c);
    }

    @Transactional
    public ConnectionResponse decline(UUID viewerId, UUID connectionId) {
        Connection c = mustExist(connectionId);
        if (!c.getAddressee().getId().equals(viewerId)) {
            throw new AccessDeniedException("Only the addressee can decline");
        }
        c.setStatus(ConnectionStatus.DECLINED);
        return toDto(c);
    }

    @Transactional
    public void cancel(UUID viewerId, UUID connectionId) {
        Connection c = mustExist(connectionId);
        if (!c.getRequester().getId().equals(viewerId)) {
            throw new AccessDeniedException("Only the requester can cancel");
        }
        if (c.getStatus() != ConnectionStatus.PENDING) {
            throw new BusinessException("Only pending requests can be cancelled");
        }
        c.setStatus(ConnectionStatus.CANCELLED);
    }

    @Transactional(readOnly = true)
    public ConnectionState stateBetween(UUID viewerId, UUID otherUserId) {
        if (viewerId.equals(otherUserId)) return new ConnectionState("SELF", null);
        return connectionRepository.findBetween(viewerId, otherUserId)
                .map(c -> {
                    String state = switch (c.getStatus()) {
                        case ACCEPTED -> "ACCEPTED";
                        case DECLINED -> "DECLINED";
                        case CANCELLED -> "NONE";
                        case PENDING -> c.getRequester().getId().equals(viewerId)
                                ? "OUTGOING_PENDING" : "INCOMING_PENDING";
                    };
                    // CANCELLED looks the same as NONE to the user — fresh request allowed.
                    UUID id = c.getStatus() == ConnectionStatus.CANCELLED ? null : c.getId();
                    return new ConnectionState(state, id);
                })
                .orElse(new ConnectionState("NONE", null));
    }

    @Transactional(readOnly = true)
    public List<ConnectionResponse> incomingPending(UUID viewerId) {
        return connectionRepository.findAddressedToByStatus(viewerId, ConnectionStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<ConnectionResponse> outgoingPending(UUID viewerId) {
        return connectionRepository.findRequestedByStatus(viewerId, ConnectionStatus.PENDING)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<ConnectionResponse> accepted(UUID viewerId) {
        return connectionRepository.findAccepted(viewerId)
                .stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public ConnectionCounts counts(UUID viewerId) {
        long accepted = connectionRepository.findAccepted(viewerId).size();
        long incoming = connectionRepository.countByAddresseeIdAndStatus(viewerId, ConnectionStatus.PENDING);
        long outgoing = connectionRepository.findRequestedByStatus(viewerId, ConnectionStatus.PENDING).size();
        return new ConnectionCounts(accepted, incoming, outgoing);
    }

    /**
     * People you may know — up to `limit` profiles ranked by a relevance
     * score (mutual connections × 4 + shared groups × 3 + same promo × 2
     * + same specialty × 1). The repository returns ~50 candidates whose
     * specialty OR promotion matches; we score on top.
     */
    @Transactional(readOnly = true)
    public List<SuggestedConnection> peopleYouMayKnow(UUID viewerId, int limit) {
        var viewerProfile = profileRepository.findByUserId(viewerId).orElse(null);
        if (viewerProfile == null) return List.of();

        var excluded = new HashSet<>(connectionRepository.activeCounterpartiesOf(viewerId));
        excluded.add(viewerId);   // never recommend yourself

        UUID viewerSpecialty = viewerProfile.getSpecialty() == null ? null
                : viewerProfile.getSpecialty().getId();
        UUID viewerPromotion = viewerProfile.getPromotion() == null ? null
                : viewerProfile.getPromotion().getId();

        var candidates = profileRepository.suggestionCandidates(
                viewerId, excluded, viewerSpecialty, viewerPromotion,
                PageRequest.of(0, 50));

        // Viewer's accepted-connection user IDs — used to count mutuals.
        Set<UUID> viewerConns = new HashSet<>();
        for (Connection c : connectionRepository.findAccepted(viewerId)) {
            UUID other = c.getRequester().getId().equals(viewerId)
                    ? c.getAddressee().getId() : c.getRequester().getId();
            viewerConns.add(other);
        }

        var scored = new ArrayList<ScoredSuggestion>();
        for (Profile p : candidates) {
            UUID candId = p.getUser().getId();
            int sharedConns = 0;
            for (Connection c : connectionRepository.findAccepted(candId)) {
                UUID other = c.getRequester().getId().equals(candId)
                        ? c.getAddressee().getId() : c.getRequester().getId();
                if (viewerConns.contains(other)) sharedConns++;
            }
            int sharedGroups = (int) groupMemberRepository.countSharedGroups(viewerId, candId);

            boolean samePromo = viewerPromotion != null
                    && p.getPromotion() != null
                    && viewerPromotion.equals(p.getPromotion().getId());
            boolean sameSpec  = viewerSpecialty != null
                    && p.getSpecialty() != null
                    && viewerSpecialty.equals(p.getSpecialty().getId());

            int score = 4 * sharedConns + 3 * sharedGroups
                    + (samePromo ? 2 : 0) + (sameSpec ? 1 : 0);
            int promoDelta = (viewerProfile.getPromotion() != null && p.getPromotion() != null)
                    ? Math.abs(viewerProfile.getPromotion().getYear() - p.getPromotion().getYear())
                    : 99;

            scored.add(new ScoredSuggestion(p, score, promoDelta,
                    sharedConns, sharedGroups, samePromo, sameSpec));
        }

        return scored.stream()
                .sorted(Comparator
                        .comparingInt((ScoredSuggestion s) -> -s.score())
                        .thenComparingInt(ScoredSuggestion::promoDelta))
                .limit(limit)
                .map(this::toSuggestion)
                .toList();
    }

    private SuggestedConnection toSuggestion(ScoredSuggestion s) {
        Profile p = s.profile();
        String reason;
        if      (s.sharedConns() > 0)  reason = s.sharedConns() + " mutual connection" + (s.sharedConns() == 1 ? "" : "s");
        else if (s.sharedGroups() > 0) reason = "Shares " + s.sharedGroups() + " group" + (s.sharedGroups() == 1 ? "" : "s") + " with you";
        else if (s.samePromo())        reason = "Same promotion year";
        else if (s.sameSpec())         reason = "Same specialty";
        else                           reason = "Recommended for you";

        return new SuggestedConnection(
                p.getUser().getId(),
                p.getFirstName(), p.getLastName(),
                p.getHeadline(),
                p.getSpecialty() == null ? null : p.getSpecialty().getCode(),
                p.getPromotion() == null ? null : p.getPromotion().getYear(),
                s.sharedConns(), s.sharedGroups(), reason,
                p.getAvatarUrl());
    }

    /** Internal scoring tuple — only used inside this service. */
    private record ScoredSuggestion(
            Profile profile, int score, int promoDelta,
            int sharedConns, int sharedGroups, boolean samePromo, boolean sameSpec) {}

    // ---------- helpers ----------

    private void notifyIncoming(Connection c, String message) {
        // If the requester wrote a personal note, surface it in the notification
        // body so the addressee can decide without leaving the bell dropdown.
        String body = (message != null && !message.isBlank())
                ? "\"" + message.trim() + "\""
                : "Open your network to accept or decline.";
        notificationService.create(c.getAddressee().getId(),
                "CONNECTION_REQUEST",
                "New connection request from " + c.getRequester().getEmail(),
                body,
                "/network");
    }

    private Connection mustExist(UUID id) {
        return connectionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Connection", id));
    }

    private User userOrThrow(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    private ConnectionResponse toDto(Connection c) {
        User r = c.getRequester();
        User a = c.getAddressee();
        Profile rp = r.getProfile();
        Profile ap = a.getProfile();
        return new ConnectionResponse(
                c.getId(),
                r.getId(), r.getEmail(), displayName(rp, r), rp == null ? null : rp.getAvatarUrl(),
                a.getId(), a.getEmail(), displayName(ap, a), ap == null ? null : ap.getAvatarUrl(),
                c.getStatus(), c.getCreatedAt()
        );
    }

    private static String displayName(Profile p, User u) {
        if (p == null) return u.getEmail();
        String name = ((p.getFirstName() == null ? "" : p.getFirstName()) + " "
                + (p.getLastName() == null ? "" : p.getLastName())).trim();
        return name.isEmpty() ? u.getEmail() : name;
    }
}
