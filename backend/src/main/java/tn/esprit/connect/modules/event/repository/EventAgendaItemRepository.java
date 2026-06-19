package tn.esprit.connect.modules.event.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.event.entity.EventAgendaItem;

import java.util.List;
import java.util.UUID;

@Repository
public interface EventAgendaItemRepository extends JpaRepository<EventAgendaItem, UUID> {
    List<EventAgendaItem> findByEventIdOrderBySortOrderAsc(UUID eventId);
}
