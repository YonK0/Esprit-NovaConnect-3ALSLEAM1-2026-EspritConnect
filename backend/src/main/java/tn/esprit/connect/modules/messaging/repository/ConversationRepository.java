package tn.esprit.connect.modules.messaging.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.messaging.entity.Conversation;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    @Query("""
           select c from Conversation c
           join c.participants p1
           join c.participants p2
           where p1.id = :a and p2.id = :b and size(c.participants) = 2
           """)
    Optional<Conversation> findOneToOne(@Param("a") UUID a, @Param("b") UUID b);

    @Query("""
           select distinct c from Conversation c
           join c.participants p
           where p.id = :userId and c.deletedAt is null
           order by c.lastMessageAt desc nulls last
           """)
    List<Conversation> findForUser(@Param("userId") UUID userId);
}
