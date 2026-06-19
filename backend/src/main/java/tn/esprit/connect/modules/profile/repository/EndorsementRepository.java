package tn.esprit.connect.modules.profile.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.profile.entity.Endorsement;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EndorsementRepository extends JpaRepository<Endorsement, UUID> {
    Optional<Endorsement> findBySkillIdAndEndorserId(UUID skillId, UUID endorserId);
    long countBySkillId(UUID skillId);

    @Query("""
           select e from Endorsement e
           where e.skill.profile.id = :profileId
           """)
    List<Endorsement> findForProfile(@Param("profileId") UUID profileId);

    @Query("""
           select e from Endorsement e
           join fetch e.endorser
           where e.skill.id = :skillId
           order by e.createdAt desc
           """)
    List<Endorsement> findBySkillIdOrderByCreatedAtDesc(@Param("skillId") UUID skillId);
}
