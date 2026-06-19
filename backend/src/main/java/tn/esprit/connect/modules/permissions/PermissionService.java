package tn.esprit.connect.modules.permissions;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Decides whether a user can perform a specific action.
 *
 * The check is a two-step:
 *   1. Does the user's role grant this permission by default? If no → deny.
 *   2. Has an admin explicitly revoked this permission for this user? If
 *      yes → deny. Otherwise allow.
 *
 * Admins always pass — they bypass the revocation check so they can never
 * be locked out of their own moderation tools by another admin.
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final UserRepository userRepository;
    private final UserPermissionRevocationRepository revocationRepository;
    private final RolePermissionOverrideRepository roleOverrideRepository;

    @Transactional(readOnly = true)
    public boolean can(UUID userId, Permission permission) {
        if (userId == null) return false;
        User u = userRepository.findById(userId).orElse(null);
        if (u == null) return false;

        // ADMIN bypass — admins can always do anything we model here.
        if (u.getRole() == Role.ADMIN) return true;

        // Role baseline (enum default, possibly overridden by an admin) then
        // the per-user revocation on top.
        if (!effectiveRoleAllows(u.getRole(), permission)) return false;
        return !revocationRepository.existsByUserIdAndPermissionCode(userId, permission.name());
    }

    /**
     * Whether {@code role} grants {@code permission} at the role level: an
     * explicit admin override wins, otherwise the enum's hardcoded default.
     */
    @Transactional(readOnly = true)
    public boolean effectiveRoleAllows(Role role, Permission permission) {
        return roleOverrideRepository.findByRoleAndPermissionCode(role, permission.name())
                .map(RolePermissionOverride::isAllowed)
                .orElseGet(() -> permission.grantedByDefaultFor(role));
    }

    /**
     * Sets a role's permission. To keep the table minimal, an override row
     * is only stored when the desired state differs from the enum default;
     * if it matches the default again, any existing override is removed.
     * ADMIN is never stored — admins bypass the check entirely.
     */
    @Transactional
    public void setRolePermission(Role role, Permission permission, boolean allowed) {
        if (role == Role.ADMIN) return;
        var existing = roleOverrideRepository
                .findByRoleAndPermissionCode(role, permission.name()).orElse(null);
        if (allowed == permission.grantedByDefaultFor(role)) {
            if (existing != null) roleOverrideRepository.delete(existing);
            return;
        }
        if (existing != null) {
            existing.setAllowed(allowed);
            existing.setUpdatedAt(Instant.now());
            roleOverrideRepository.save(existing);
        } else {
            roleOverrideRepository.save(RolePermissionOverride.builder()
                    .role(role).permissionCode(permission.name()).allowed(allowed).build());
        }
    }

    /** Throws {@link AccessDeniedException} when the check fails. Use at
     *  controller entrypoints to short-circuit forbidden actions with a
     *  consistent 403 response. */
    public void require(UUID userId, Permission permission) {
        if (!can(userId, permission)) {
            throw new AccessDeniedException(
                "You don't have permission to do this — an admin may have disabled this feature for you.");
        }
    }

    @Transactional(readOnly = true)
    public List<UserPermissionRevocation> listRevocationsFor(UUID userId) {
        return revocationRepository.findByUserId(userId);
    }

    @Transactional
    public void revoke(UUID userId, Permission permission, UUID adminId, String reason) {
        User target = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        User admin = adminId == null ? null : userRepository.findById(adminId).orElse(null);
        if (revocationRepository.existsByUserIdAndPermissionCode(userId, permission.name())) {
            return;   // idempotent
        }
        revocationRepository.save(UserPermissionRevocation.builder()
                .userId(target.getId())
                .permissionCode(permission.name())
                .revokedBy(admin)
                .reason(reason)
                .build());
    }

    @Transactional
    public void grant(UUID userId, Permission permission) {
        revocationRepository.deleteByUserIdAndPermissionCode(userId, permission.name());
    }
}
