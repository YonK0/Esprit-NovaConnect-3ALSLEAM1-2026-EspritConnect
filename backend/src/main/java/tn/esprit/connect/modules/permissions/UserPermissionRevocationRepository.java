package tn.esprit.connect.modules.permissions;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserPermissionRevocationRepository
        extends JpaRepository<UserPermissionRevocation, UserPermissionRevocation.Pk> {

    List<UserPermissionRevocation> findByUserId(UUID userId);
    boolean existsByUserIdAndPermissionCode(UUID userId, String permissionCode);
    Optional<UserPermissionRevocation> findByUserIdAndPermissionCode(UUID userId, String permissionCode);
    void deleteByUserIdAndPermissionCode(UUID userId, String permissionCode);
}
