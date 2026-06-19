package tn.esprit.connect.modules.user.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.profile.entity.Profile;

import java.time.Instant;

@Entity
@Table(name = "users", indexes = {
        @Index(name = "idx_users_email", columnList = "email", unique = true),
        @Index(name = "idx_users_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User extends BaseEntity {

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private UserStatus status;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Column(name = "ev_token", length = 128)
    private String evToken;

    @Column(name = "ev_token_expires_at")
    private Instant evTokenExpiresAt;

    /** One-shot password-reset token. Cleared on use or expiry. */
    @Column(name = "pwd_reset_token", length = 128)
    private String pwdResetToken;

    @Column(name = "pwd_reset_expires_at")
    private Instant pwdResetExpiresAt;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "verification_attempts_count", nullable = false)
    @Builder.Default
    private Integer verificationAttemptsCount = 0;

    /**
     * True once the user has completed the identity-verification flow
     * (document + face match). Independent of {@link #emailVerified} and
     * {@link #status} — a user can be ACTIVE without identity verification
     * since the orchestrator step is now optional at signup.
     */
    @Column(name = "identity_verified", nullable = false)
    @Builder.Default
    private boolean identityVerified = false;

    /**
     * When non-null, an admin has asked this user to (re)complete identity
     * verification. The frontend shows a banner until the user finishes
     * the flow, at which point {@link #identityVerified} flips to true and
     * this timestamp is cleared.
     */
    @Column(name = "identity_verification_requested_at")
    private Instant identityVerificationRequestedAt;

    /** 128-d face embedding (dlib). Lazy-loaded to avoid pulling bytes on every read. */
    @Basic(fetch = FetchType.LAZY)
    @Column(name = "face_embedding")
    private byte[] faceEmbedding;

    @Column(name = "open_to_work", nullable = false)
    @Builder.Default
    private boolean openToWork = false;

    @Column(name = "pending_new_email", length = 255)
    private String pendingNewEmail;

    @OneToOne(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private Profile profile;
}
