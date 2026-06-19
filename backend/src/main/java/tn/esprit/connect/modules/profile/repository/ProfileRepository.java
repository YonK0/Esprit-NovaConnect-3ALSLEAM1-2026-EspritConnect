package tn.esprit.connect.modules.profile.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.profile.entity.Profile;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProfileRepository extends JpaRepository<Profile, UUID> {
    Optional<Profile> findByUserId(UUID userId);

    @Query("""
           select p from Profile p
           where p.searchable = true
             and p.deletedAt is null
             and (lower(p.firstName) like lower(concat('%', :q, '%'))
                  or lower(p.lastName) like lower(concat('%', :q, '%'))
                  or lower(p.headline) like lower(concat('%', :q, '%'))
                  or lower(p.city) like lower(concat('%', :q, '%')))
           """)
    org.springframework.data.domain.Page<Profile> search(@Param("q") String q,
                                                          org.springframework.data.domain.Pageable pageable);

    /**
     * Advanced filtered search — every parameter is optional. When null
     * (or blank string for `q`/`country`/`city`), the corresponding clause
     * becomes a tautology and doesn't restrict the result set.
     *
     * Promotion year range: `promotionYearMin` and `promotionYearMax` bound
     * inclusive. Use the same value for both to filter a single year.
     */
    @Query("""
           select p from Profile p
             left join p.specialty s
             left join p.promotion pr
           where p.searchable = true
             and p.deletedAt is null
             and (:q is null or :q = ''
                  or lower(p.firstName) like lower(concat('%', :q, '%'))
                  or lower(p.lastName) like lower(concat('%', :q, '%'))
                  or lower(p.headline) like lower(concat('%', :q, '%'))
                  or lower(p.city) like lower(concat('%', :q, '%')))
             and (:specialtyCode is null or :specialtyCode = ''
                  or s.code = :specialtyCode)
             and (:country is null or :country = ''
                  or lower(p.country) = lower(:country))
             and (:city is null or :city = ''
                  or lower(p.city) like lower(concat('%', :city, '%')))
             and (:promotionYearMin is null or pr.year >= :promotionYearMin)
             and (:promotionYearMax is null or pr.year <= :promotionYearMax)
           """)
    org.springframework.data.domain.Page<Profile> searchFiltered(
            @Param("q") String q,
            @Param("specialtyCode") String specialtyCode,
            @Param("country") String country,
            @Param("city") String city,
            @Param("promotionYearMin") Integer promotionYearMin,
            @Param("promotionYearMax") Integer promotionYearMax,
            org.springframework.data.domain.Pageable pageable);

    /**
     * Suggestion candidates for "people you may know": active+approved users
     * who share at least one of (specialty, promotion year) with the viewer,
     * excluding the viewer themselves and any user already in a non-terminal
     * relationship. Ordered by promotion year proximity then specialty match
     * — both rough proxies for "professionally relevant".
     *
     * The match logic is intentionally permissive — the controller does the
     * fine-grained scoring (shared connections, shared groups) on top of this
     * candidate pool. Loading all candidates would be wasteful; we cap at
     * ~50 in the SQL and let the service decide the final top-N.
     */
    @Query("""
           select p from Profile p
             join p.user u
           where p.searchable = true
             and p.deletedAt is null
             and u.status = tn.esprit.connect.modules.user.entity.UserStatus.ACTIVE
             and u.id <> :viewerId
             and u.id not in :excluded
             and (
                 (:specialtyId is not null and p.specialty.id = :specialtyId)
                 or (:promotionId is not null and p.promotion.id = :promotionId)
             )
           order by
             case when p.promotion.id = :promotionId then 0 else 1 end,
             case when p.specialty.id = :specialtyId then 0 else 1 end,
             p.lastName
           """)
    List<Profile> suggestionCandidates(@Param("viewerId") UUID viewerId,
                                        @Param("excluded") Collection<UUID> excluded,
                                        @Param("specialtyId") UUID specialtyId,
                                        @Param("promotionId") UUID promotionId,
                                        org.springframework.data.domain.Pageable pageable);
}
