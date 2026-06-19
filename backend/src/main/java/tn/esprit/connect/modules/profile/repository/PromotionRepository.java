package tn.esprit.connect.modules.profile.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.profile.entity.Promotion;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PromotionRepository extends JpaRepository<Promotion, UUID> {
    Optional<Promotion> findByYearAndDepartment(Integer year, String department);
    Optional<Promotion> findFirstByYear(Integer year);
}
