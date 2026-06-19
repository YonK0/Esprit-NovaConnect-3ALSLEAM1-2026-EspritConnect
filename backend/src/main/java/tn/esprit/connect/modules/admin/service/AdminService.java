package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.admin.dto.AdminDtos.*;
import tn.esprit.connect.modules.admin.entity.AuditLog;
import tn.esprit.connect.modules.admin.repository.AuditLogRepository;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.modules.event.repository.EventRepository;
import tn.esprit.connect.modules.feed.repository.PostRepository;
import tn.esprit.connect.modules.job.repository.JobOfferRepository;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.entity.UserStatus;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final JobOfferRepository jobOfferRepository;
    private final EventRepository eventRepository;
    private final AuditLogRepository auditLogRepository;
    private final ProfileRepository profileRepository;
    private final MailService mailService;

    @Transactional(readOnly = true)
    public DashboardStats stats() {
        long total = userRepository.count();
        long active = userRepository.countByStatus(UserStatus.ACTIVE);
        long pending = userRepository.countByStatus(UserStatus.PENDING)
                + userRepository.countByStatus(UserStatus.PENDING_APPROVAL);
        return new DashboardStats(total, active, pending,
                postRepository.count(), jobOfferRepository.count(), eventRepository.count());
    }

    @Transactional
    public void approveUser(UUID userId, UUID adminId) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        boolean wasInactive = u.getStatus() != UserStatus.ACTIVE;
        u.setStatus(UserStatus.ACTIVE);
        // Auto-verify email on admin approval — they've reviewed the documents,
        // we no longer need the registrant to click the link.
        u.setEmailVerified(true);
        u.setEvToken(null);
        u.setEvTokenExpiresAt(null);

        // Email notifications: approval (new activation) vs reactivation
        // (formerly SUSPENDED → ACTIVE). The user-visible copy differs.
        if (wasInactive) {
            String firstName = profileRepository.findByUserId(userId)
                    .map(p -> p.getFirstName()).orElse(null);
            mailService.sendApprovalEmail(u.getEmail(), firstName);
        }
        log(adminId, "USER_APPROVED", Map.of("userId", userId.toString()));
    }

    @Transactional
    public void suspendUser(UUID userId, UUID adminId, String reason) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        u.setStatus(UserStatus.SUSPENDED);
        mailService.sendSuspensionEmail(u.getEmail(), reason);
        log(adminId, "USER_SUSPENDED", Map.of("userId", userId.toString(),
                "reason", reason == null ? "" : reason));
    }

    /** Admin manually flips the emailVerified flag without a token exchange.
     * Useful when SMTP is down or the user can't access their inbox. */
    @Transactional
    public void setEmailVerified(UUID userId, UUID adminId, boolean verified) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        u.setEmailVerified(verified);
        if (verified) {
            u.setEvToken(null);
            u.setEvTokenExpiresAt(null);
        }
        log(adminId, "USER_EMAIL_VERIFIED_BY_ADMIN",
                Map.of("userId", userId.toString(), "verified", verified));
    }

    /** Generate a fresh password-reset token and email it to the user.
     * Admin path — for users who say "I forgot my password" out of band. */
    @Transactional
    public void forcePasswordReset(UUID userId, UUID adminId) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        String token = UUID.randomUUID().toString();
        u.setPwdResetToken(token);
        u.setPwdResetExpiresAt(Instant.now().plusSeconds(2 * 3600));   // 2h window
        mailService.sendPasswordReset(u.getEmail(), token);
        log(adminId, "USER_FORCED_PASSWORD_RESET", Map.of("userId", userId.toString()));
    }

    /**
     * Flags the user with an admin-requested identity verification and
     * emails them a link to resume the wizard. Idempotent — calling it
     * twice just refreshes the timestamp.
     */
    @Transactional
    public void requestIdentityVerification(UUID userId, UUID adminId) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        if (u.isIdentityVerified()) {
            throw new tn.esprit.connect.common.exception.BusinessException(
                    "User is already identity-verified.");
        }
        u.setIdentityVerificationRequestedAt(Instant.now());
        String firstName = u.getProfile() == null ? null : u.getProfile().getFirstName();
        mailService.sendIdentityVerificationRequest(u.getEmail(), firstName);
        log(adminId, "IDENTITY_VERIFICATION_REQUESTED",
                Map.of("userId", userId.toString()));
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> auditLogs(Pageable pageable) {
        return auditLogRepository.findAllByOrderByCreatedAtDesc(pageable)
                .map(a -> new AuditLogResponse(a.getId(),
                        a.getUser() == null ? null : a.getUser().getId(),
                        a.getAction(), a.getMetadata(), a.getCreatedAt()));
    }

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<AdminUserResponse> listUsers(
            org.springframework.data.domain.Pageable pageable) {
        return userRepository.findAll(pageable)
                .map(u -> new AdminUserResponse(u.getId(), u.getEmail(),
                        u.getRole().name(), u.getStatus().name(),
                        u.getCreatedAt(), u.getLastLoginAt(),
                        u.isEmailVerified(), u.isIdentityVerified(),
                        u.getIdentityVerificationRequestedAt()));
    }

    @Transactional
    public void changeRole(UUID userId, UUID adminId, String roleName) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        Role newRole = Role.valueOf(roleName.toUpperCase());
        // Promoting to ADMIN is allowed from the panel (an existing admin is
        // already authenticated to reach this endpoint). Guard the one
        // dangerous case: an admin demoting themselves, which could leave the
        // platform with no administrators.
        if (u.getId().equals(adminId) && newRole != Role.ADMIN) {
            throw new tn.esprit.connect.common.exception.BusinessException(
                    "You cannot change your own admin role.");
        }
        u.setRole(newRole);
        log(adminId, "USER_ROLE_CHANGED",
                Map.of("userId", userId.toString(), "newRole", roleName));
    }

    /**
     * Permanently delete a user (soft delete). Sets status to DELETED and marks deletedAt timestamp.
     * All associated data is preserved but the user cannot log in or be visible in queries.
     */
    @Transactional
    public void deleteUser(UUID userId, UUID adminId) {
        User u = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        
        if (u.getStatus() == UserStatus.DELETED) {
            throw new tn.esprit.connect.common.exception.BusinessException(
                    "User is already deleted.");
        }
        
        u.setStatus(UserStatus.DELETED);
        u.setDeletedAt(Instant.now());
        userRepository.save(u);
        
        log(adminId, "USER_DELETED",
                Map.of("userId", userId.toString(), "email", u.getEmail()));
    }

    @Transactional
    public void log(UUID adminId, String action, Map<String, Object> metadata) {
        User admin = adminId == null ? null : userRepository.findById(adminId).orElse(null);
        auditLogRepository.save(AuditLog.builder()
                .user(admin).action(action)
                .metadata(metadata == null ? new HashMap<>() : metadata).build());
    }
}
