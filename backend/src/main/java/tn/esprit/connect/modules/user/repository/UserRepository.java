package tn.esprit.connect.modules.user.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.entity.UserStatus;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("select u from User u where lower(u.email) = lower(?1) and u.deletedAt is null")
    Optional<User> findByEmail(String email);

    boolean existsByEmailIgnoreCase(String email);

    Optional<User> findByEvToken(String evToken);

    Optional<User> findByPwdResetToken(String pwdResetToken);

    /**
     * Used by the admin verifications tab. PENDING_APPROVAL is the new
     * post-verification state; PENDING is the legacy pre-Phase-1 state.
     * Admins want to see both in one queue.
     */
    @Query("""
           select u from User u
           where u.deletedAt is null
             and (u.status in :statuses
                  or (u.status = tn.esprit.connect.modules.user.entity.UserStatus.ACTIVE
                      and u.identityVerificationRequestedAt is not null))
           order by u.createdAt desc
           """)
    Page<User> findPendingVerifications(@Param("statuses") Collection<UserStatus> statuses,
                                         Pageable pageable);

    long countByStatus(UserStatus status);
}
