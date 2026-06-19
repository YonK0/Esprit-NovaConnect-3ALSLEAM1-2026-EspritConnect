package tn.esprit.connect.modules.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.event.entity.EventSpeaker;

import java.util.List;
import java.util.UUID;

@Repository
public interface EventSpeakerRepository extends JpaRepository<EventSpeaker, UUID> {
    List<EventSpeaker> findByEventIdOrderBySortOrderAsc(UUID eventId);
    void deleteByEventId(UUID eventId);
}
