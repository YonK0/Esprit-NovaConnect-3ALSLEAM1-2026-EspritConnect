package tn.esprit.connect.modules.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.event.entity.EventRsvp;
import tn.esprit.connect.modules.event.entity.RsvpStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventRsvpRepository extends JpaRepository<EventRsvp, UUID> {
    Optional<EventRsvp> findByEventIdAndUserId(UUID eventId, UUID userId);
    long countByEventIdAndStatus(UUID eventId, RsvpStatus status);
    long countByUserIdAndStatus(UUID userId, RsvpStatus status);
    /** All RSVPs for one event, in any status — used by the "going / maybe" list view. */
    List<EventRsvp> findByEventId(UUID eventId);
    /** Attendees in a specific status (GOING / MAYBE) for the event page list. */
    List<EventRsvp> findByEventIdAndStatusOrderByRespondedAtAsc(UUID eventId, RsvpStatus status);
}
