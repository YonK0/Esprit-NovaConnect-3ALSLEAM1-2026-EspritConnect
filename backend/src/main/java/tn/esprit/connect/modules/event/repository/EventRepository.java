package tn.esprit.connect.modules.event.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.event.entity.Event;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventRepository extends JpaRepository<Event, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = ?1")
    Optional<Event> findByIdForUpdate(UUID id);

    @Query("""
           select e from Event e
           where e.deletedAt is null
             and (e.moderationStatus = 'APPROVED' or e.organizer.id = :viewerId)
           order by e.startAt asc
           """)
    Page<Event> findUpcomingVisibleTo(@Param("viewerId") UUID viewerId, Pageable pageable);

    Page<Event> findByModerationStatusOrderByCreatedAtDesc(
            ModerationStatus status, Pageable pageable);

    /** Events organised by a single user — used for the manage dashboard. */
    Page<Event> findByOrganizerIdOrderByStartAtDesc(UUID organizerId, Pageable pageable);
}
