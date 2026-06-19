package tn.esprit.connect.modules.notification.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.notification.entity.Notification;

import java.util.UUID;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
    long countByUserIdAndReadFalse(UUID userId);

    /** Bulk-mark every unread notification of a user as read.
     *  Returns the affected row count so the caller can audit the action. */
    @Modifying
    @Query("update Notification n set n.read = true " +
           "where n.user.id = :userId and n.read = false")
    int markAllReadFor(@Param("userId") UUID userId);
}
