package tn.esprit.connect.modules.permissions;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.modules.user.entity.Role;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * One row = an admin override of a role's default permission.
 *
 * Composite primary key (role, permission_code). The {@code Permission}
 * enum still defines the baseline; when an override row exists, its
 * {@code allowed} flag wins over that baseline for the whole role. This is
 * what lets admins manage permissions <em>by role</em> (not just per user)
 * from the panel without recompiling.
 *
 * {@link PermissionService#setRolePermission} keeps the table minimal: a
 * row is only persisted when the desired state differs from the enum
 * default, and is deleted when it matches again.
 */
@Entity
@Table(name = "role_permission_overrides")
@IdClass(RolePermissionOverride.Pk.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RolePermissionOverride {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 32, nullable = false)
    private Role role;

    @Id
    @Column(name = "permission_code", length = 64, nullable = false)
    private String permissionCode;

    @Column(name = "allowed", nullable = false)
    private boolean allowed;

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    /** Composite-key class — Hibernate requires equals/hashCode. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor
    public static class Pk implements Serializable {
        private Role role;
        private String permissionCode;

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Pk pk)) return false;
            return role == pk.role && Objects.equals(permissionCode, pk.permissionCode);
        }
        @Override public int hashCode() { return Objects.hash(role, permissionCode); }
    }
}
