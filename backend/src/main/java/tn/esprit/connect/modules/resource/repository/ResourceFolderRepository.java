package tn.esprit.connect.modules.resource.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import tn.esprit.connect.modules.resource.entity.ResourceFolder;

import java.util.List;
import java.util.UUID;

public interface ResourceFolderRepository extends JpaRepository<ResourceFolder, UUID> {

    /** Non-deleted folders; search + sort are applied in the service. */
    List<ResourceFolder> findByDeletedAtIsNull();
}
