package tn.esprit.connect.modules.group.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.group.entity.Group;

import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, UUID> {

    @Query("""
           select g from Group g
           where g.deletedAt is null
             and (g.moderationStatus = 'APPROVED' or g.owner.id = :viewerId)
             and (:q is null or :q = '' or lower(g.name) like lower(concat('%', :q, '%'))
                  or lower(coalesce(g.description, '')) like lower(concat('%', :q, '%')))
           order by g.createdAt desc
           """)
    Page<Group> findVisibleTo(@Param("viewerId") UUID viewerId,
                              @Param("q") String q,
                              Pageable pageable);

    Page<Group> findByModerationStatusOrderByCreatedAtDesc(
            ModerationStatus status, Pageable pageable);
}
