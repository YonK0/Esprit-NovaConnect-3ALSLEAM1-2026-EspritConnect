package tn.esprit.connect.modules.messaging.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.messaging.entity.Message;

import java.util.List;
import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {
    List<Message> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);

    @Modifying
    @Query("""
           update Message m set m.read = true
           where m.conversation.id = :conversationId
             and m.sender.id <> :userId
             and m.read = false
           """)
    int markRead(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId);
}
