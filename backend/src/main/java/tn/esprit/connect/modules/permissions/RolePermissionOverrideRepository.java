package tn.esprit.connect.modules.permissions;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.user.entity.Role;

import java.util.List;
import java.util.Optional;

@Repository
public interface RolePermissionOverrideRepository
        extends JpaRepository<RolePermissionOverride, RolePermissionOverride.Pk> {

    List<RolePermissionOverride> findByRole(Role role);
    Optional<RolePermissionOverride> findByRoleAndPermissionCode(Role role, String permissionCode);
}
