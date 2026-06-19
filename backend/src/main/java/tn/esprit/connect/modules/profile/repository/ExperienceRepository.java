package tn.esprit.connect.modules.profile.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.profile.entity.Experience;

import java.util.List;
import java.util.UUID;

@Repository
public interface ExperienceRepository extends JpaRepository<Experience, UUID> {
    List<Experience> findByProfileIdOrderByStartDateDesc(UUID profileId);
}
