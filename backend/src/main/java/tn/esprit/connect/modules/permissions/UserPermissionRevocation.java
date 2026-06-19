package tn.esprit.connect.modules.permissions;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.modules.user.entity.User;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One row = one permission an admin has explicitly revoked from a user.
 *
 * Composite primary key (user_id, permission_code) — a user can never have
 * the same permission revoked twice. The audit fields (revoked_at,
 * revoked_by, reason) let admins see WHO disabled WHAT and WHY.
 */
@Entity
@Table(name = "user_permission_revocations")
@IdClass(UserPermissionRevocation.Pk.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserPermissionRevocation {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(name = "permission_code", length = 64, nullable = false)
    private String permissionCode;

    @Column(name = "revoked_at", nullable = false)
    @Builder.Default
    private Instant revokedAt = Instant.now();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "revoked_by")
    private User revokedBy;

    @Column(length = 500)
    private String reason;

    /** Composite-key class — Hibernate requires equals/hashCode. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class Pk implements Serializable {
        private UUID userId;
        private String permissionCode;

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Pk pk)) return false;
            return Objects.equals(userId, pk.userId)
                    && Objects.equals(permissionCode, pk.permissionCode);
        }
        @Override public int hashCode() { return Objects.hash(userId, permissionCode); }
    }
}
