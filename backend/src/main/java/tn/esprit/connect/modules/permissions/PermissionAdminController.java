package tn.esprit.connect.modules.permissions;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.admin.service.AdminService;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.security.CustomUserDetails;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin endpoints for per-user permission management.
 *
 *   GET    /admin/permissions             → list every permission code and label
 *   GET    /admin/users/{id}/permissions  → return revocations for one user
 *   POST   /admin/users/{id}/permissions/revoke?code=...&reason=... → DENY a permission
 *   DELETE /admin/users/{id}/permissions/{code} → re-allow a permission
 *
 * All actions are audit-logged via AdminService.log().
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin · permissions")
public class PermissionAdminController {

    private final PermissionService permissionService;
    private final AdminService adminService;

    /** Catalogue endpoint — gives the admin UI the list of permission codes
     *  it can offer to revoke. Sourced from the enum so it stays in sync. */
    @GetMapping("/permissions")
    public ResponseEntity<List<Map<String, String>>> catalogue() {
        return ResponseEntity.ok(Arrays.stream(Permission.values())
                .map(p -> Map.of(
                        "code", p.name(),
                        "label", humanReadable(p.name())))
                .toList());
    }

    @GetMapping("/users/{id}/permissions")
    public ResponseEntity<List<Map<String, Object>>> forUser(@PathVariable UUID id) {
        var rows = permissionService.listRevocationsFor(id).stream()
                .map(r -> {
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("code", r.getPermissionCode());
                    m.put("label", humanReadable(r.getPermissionCode()));
                    m.put("revokedAt", r.getRevokedAt());
                    m.put("revokedBy", r.getRevokedBy() == null ? null : r.getRevokedBy().getEmail());
                    m.put("reason", r.getReason());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/users/{id}/permissions/revoke")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal CustomUserDetails admin,
                                        @PathVariable UUID id,
                                        @RequestParam String code,
                                        @RequestParam(required = false) String reason) {
        Permission perm = Permission.valueOf(code);
        permissionService.revoke(id, perm, admin.getId(), reason);
        adminService.log(admin.getId(), "PERMISSION_REVOKED",
                Map.of("userId", id.toString(), "permission", code,
                       "reason", reason == null ? "" : reason,
                       "at", Instant.now().toString()));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/users/{id}/permissions/{code}")
    public ResponseEntity<Void> grant(@AuthenticationPrincipal CustomUserDetails admin,
                                       @PathVariable UUID id,
                                       @PathVariable String code) {
        Permission perm = Permission.valueOf(code);
        permissionService.grant(id, perm);
        adminService.log(admin.getId(), "PERMISSION_RESTORED",
                Map.of("userId", id.toString(), "permission", code));
        return ResponseEntity.noContent().build();
    }

    // ── Role-level permissions (the role × permission matrix) ────────────────

    /** Roles the matrix lets admins edit. ADMIN is excluded — admins bypass
     *  every permission check, so there's nothing to toggle for them. */
    private static final List<Role> EDITABLE_ROLES =
            List.of(Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER);

    /**
     * Returns the full role × permission matrix of <em>effective</em> values
     * (admin override if set, else the enum default), plus the column
     * (permission) and row (role) headers the UI renders.
     */
    @GetMapping("/role-permissions")
    public ResponseEntity<Map<String, Object>> roleMatrix() {
        List<Map<String, String>> permissions = Arrays.stream(Permission.values())
                .map(p -> Map.of("code", p.name(), "label", humanReadable(p.name())))
                .toList();

        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (Role r : EDITABLE_ROLES) {
            Map<String, Boolean> row = new LinkedHashMap<>();
            for (Permission p : Permission.values()) {
                row.put(p.name(), permissionService.effectiveRoleAllows(r, p));
            }
            matrix.put(r.name(), row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roles", EDITABLE_ROLES.stream().map(Role::name).toList());
        out.put("permissions", permissions);
        out.put("matrix", matrix);
        return ResponseEntity.ok(out);
    }

    /** Sets one role's permission on/off. Audit-logged. */
    @PutMapping("/role-permissions")
    public ResponseEntity<Void> setRolePermission(@AuthenticationPrincipal CustomUserDetails admin,
                                                  @RequestParam String role,
                                                  @RequestParam String code,
                                                  @RequestParam boolean allowed) {
        Role r = Role.valueOf(role.toUpperCase());
        Permission perm = Permission.valueOf(code);
        permissionService.setRolePermission(r, perm, allowed);
        adminService.log(admin.getId(), "ROLE_PERMISSION_CHANGED",
                Map.of("role", r.name(), "permission", code, "allowed", String.valueOf(allowed)));
        return ResponseEntity.noContent().build();
    }

    /** Turn POST_CREATE → "Post create". Keeps the admin UI readable. */
    private static String humanReadable(String code) {
        String[] parts = code.toLowerCase().split("_");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append(' ');
            sb.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
        }
        return sb.toString();
    }
}
