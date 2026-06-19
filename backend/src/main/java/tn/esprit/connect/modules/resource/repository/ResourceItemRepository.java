package tn.esprit.connect.modules.resource.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.resource.entity.ResourceItem;

import java.util.List;
import java.util.UUID;

public interface ResourceItemRepository extends JpaRepository<ResourceItem, UUID> {

    List<ResourceItem> findByFolderIdAndStatusOrderByCreatedAtDesc(UUID folderId, ModerationStatus status);

    List<ResourceItem> findByFolderIdAndStatusAndSubmittedByOrderByCreatedAtDesc(
            UUID folderId, ModerationStatus status, UUID submittedBy);

    List<ResourceItem> findByStatusOrderByCreatedAtDesc(ModerationStatus status);

    long countByStatus(ModerationStatus status);

    /** One pass to count APPROVED items per folder → [folderId(UUID), count(Long)]. */
    @Query("""
           select i.folder.id, count(i)
           from ResourceItem i
           where i.status = tn.esprit.connect.common.moderation.ModerationStatus.APPROVED
           group by i.folder.id
           """)
    List<Object[]> countApprovedByFolder();
}
