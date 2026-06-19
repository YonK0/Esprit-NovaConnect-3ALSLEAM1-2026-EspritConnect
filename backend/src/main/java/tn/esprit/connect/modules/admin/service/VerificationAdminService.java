package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.admin.dto.VerificationAdminDtos.*;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.entity.UserStatus;
import tn.esprit.connect.modules.user.repository.UserRepository;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.verification.entity.VerificationAttempt;
import tn.esprit.connect.modules.verification.repository.VerificationAttemptRepository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Admin-facing operations for the verification queue.
 *
 * Approve flips the user to ACTIVE + emits a welcome notification.
 * Reject flips the user to SUSPENDED (no separate REJECTED status exists)
 * and records the reason on the audit log. Both actions log to AuditLog
 * via the existing {@link AdminService#log} entry-point.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VerificationAdminService {

    /** What "pending verification" means for the admin queue. */
    private static final Set<UserStatus> QUEUE_STATUSES = Set.of(
            UserStatus.PENDING,             // legacy direct signups
            UserStatus.PENDING_APPROVAL,    // post-verification, awaiting admin
            UserStatus.VERIFICATION_FAILED, // gave up after retries
            UserStatus.DRAFT,               // started but never finished
            UserStatus.VERIFYING            // mid-flow
    );

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final VerificationAttemptRepository attemptRepository;
    private final NotificationService notificationService;
    private final AdminService adminService;
    private final StorageService storageService;

    @Transactional(readOnly = true)
    public Page<PendingVerification> list(Pageable pageable) {
        return userRepository.findPendingVerifications(QUEUE_STATUSES, pageable)
                .map(this::toPending);
    }

    @Transactional(readOnly = true)
    public VerificationDetail detail(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        // Use inline base64 data URLs for the chain modal so the ID documents
        // and face frames render in the browser (the private bucket's presigned
        // URLs don't load client-side).
        List<LastAttemptSummary> history = attemptRepository.findByUserIdOrderByCreatedAtAsc(userId)
                .stream().map(this::toSummaryWithImages).toList();
        return new VerificationDetail(toPending(user), history);
    }

    @Transactional
    public void approve(UUID userId, UUID adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (user.getStatus() == UserStatus.ACTIVE) {
            throw new BusinessException("User is already ACTIVE.");
        }
        user.setStatus(UserStatus.ACTIVE);
        user.setVerifiedAt(user.getVerifiedAt() != null ? user.getVerifiedAt() : Instant.now());

        adminService.log(adminId, "USER_VERIFICATION_APPROVED",
                Map.of("userId", userId.toString(), "previousStatus", user.getStatus().name()));

        notificationService.create(
                userId,
                "VERIFICATION_APPROVED",
                "Welcome to EspritConnect!",
                "Your account has been verified and is now active. Log in to get started.",
                "/login"
        );
        log.info("Admin {} approved user {} ({})", adminId, user.getEmail(), userId);
    }

    @Transactional
    public void reject(UUID userId, UUID adminId, String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessException("Rejection reason is required.");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (user.getStatus() == UserStatus.ACTIVE) {
            throw new BusinessException("Cannot reject an already-ACTIVE user — use suspend instead.");
        }
        user.setStatus(UserStatus.SUSPENDED);

        adminService.log(adminId, "USER_VERIFICATION_REJECTED",
                Map.of(
                        "userId", userId.toString(),
                        "reason", reason
                ));

        notificationService.create(
                userId,
                "VERIFICATION_REJECTED",
                "Account verification was not approved",
                "An admin rejected your registration: " + reason
                        + " — contact support@espritconnect.tn if you believe this is a mistake.",
                "/"
        );
        log.info("Admin {} rejected user {}: {}", adminId, user.getEmail(), reason);
    }

    /**
     * Acknowledge a completed (or in-progress) admin-requested identity
     * re-verification: clears the request timestamp so the (already ACTIVE)
     * user drops off the verifications queue. The audit chain is preserved.
     */
    @Transactional
    public void acknowledge(UUID userId, UUID adminId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        user.setIdentityVerificationRequestedAt(null);
        adminService.log(adminId, "IDENTITY_VERIFICATION_ACKNOWLEDGED",
                Map.of("userId", userId.toString()));
        log.info("Admin {} acknowledged identity re-verification for {}", adminId, user.getEmail());
    }

    // ---------------- mapping ----------------

    private PendingVerification toPending(User user) {
        Profile p = profileRepository.findByUserId(user.getId()).orElse(null);

        LastAttemptSummary last = attemptRepository
                .findFirstByUserIdOrderByCreatedAtDesc(user.getId())
                .map(this::toSummary)
                .orElse(null);

        return new PendingVerification(
                user.getId(),
                user.getEmail(),
                p == null ? null : p.getFirstName(),
                p == null ? null : p.getLastName(),
                user.getRole().name(),
                user.getStatus().name(),
                user.getVerificationAttemptsCount(),
                user.getVerifiedAt(),
                user.getCreatedAt(),
                p != null && p.getSpecialty() != null ? p.getSpecialty().getCode() : null,
                p != null && p.getPromotion() != null ? p.getPromotion().getYear() : null,
                user.isIdentityVerified(),
                user.getIdentityVerificationRequestedAt(),
                last
        );
    }

    private LastAttemptSummary toSummary(VerificationAttempt a) {
        List<String> frameUrls = a.getFrameKeys() == null
                ? List.of()
                : a.getFrameKeys().stream()
                    .map(storageService::presignedDownloadUrl)
                    .toList();
        return new LastAttemptSummary(
                a.getStep().name(),
                a.getOutcome().name(),
                a.getNameMatchScore(),
                a.getFaceMatchScore(),
                a.getLivenessPassed(),
                a.getRejectionReason(),
                a.getCompletedAt(),
                storageService.presignedDownloadUrl(a.getIdFileUrl()),
                storageService.presignedDownloadUrl(a.getSecondaryFileUrl()),
                frameUrls
        );
    }

    /**
     * Same as {@link #toSummary} but embeds the ID/secondary documents and the
     * captured face frames as inline base64 data URLs so they render directly
     * in the admin "View chain" modal. Used only for the (single-user) detail
     * view — the list keeps the lightweight presigned variant.
     */
    private LastAttemptSummary toSummaryWithImages(VerificationAttempt a) {
        List<String> frameUrls = a.getFrameKeys() == null
                ? List.of()
                : a.getFrameKeys().stream()
                    .map(storageService::downloadAsDataUrl)
                    .filter(Objects::nonNull)
                    .toList();
        return new LastAttemptSummary(
                a.getStep().name(),
                a.getOutcome().name(),
                a.getNameMatchScore(),
                a.getFaceMatchScore(),
                a.getLivenessPassed(),
                a.getRejectionReason(),
                a.getCompletedAt(),
                storageService.downloadAsDataUrl(a.getIdFileUrl()),
                storageService.downloadAsDataUrl(a.getSecondaryFileUrl()),
                frameUrls
        );
    }
}
