package tn.esprit.connect.modules.connection.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.connection.entity.Connection;
import tn.esprit.connect.modules.connection.entity.ConnectionStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ConnectionRepository extends JpaRepository<Connection, UUID> {

    /**
     * Returns the existing connection between two users regardless of direction
     * (a → b or b → a), excluding soft-deleted rows.
     */
    @Query("""
           select c from Connection c
           where c.deletedAt is null
             and ((c.requester.id = :a and c.addressee.id = :b)
                  or (c.requester.id = :b and c.addressee.id = :a))
           """)
    Optional<Connection> findBetween(@Param("a") UUID a, @Param("b") UUID b);

    /** Pending requests aimed at the user (incoming). */
    @Query("""
           select c from Connection c
           where c.deletedAt is null
             and c.addressee.id = :userId and c.status = :status
           order by c.createdAt desc
           """)
    List<Connection> findAddressedToByStatus(@Param("userId") UUID userId,
                                              @Param("status") ConnectionStatus status);

    /** Pending requests sent by the user (outgoing). */
    @Query("""
           select c from Connection c
           where c.deletedAt is null
             and c.requester.id = :userId and c.status = :status
           order by c.createdAt desc
           """)
    List<Connection> findRequestedByStatus(@Param("userId") UUID userId,
                                            @Param("status") ConnectionStatus status);

    /** Accepted connections in either direction — used for the "N connections" badge. */
    @Query("""
           select c from Connection c
           where c.deletedAt is null
             and c.status = 'ACCEPTED'
             and (c.requester.id = :userId or c.addressee.id = :userId)
           order by c.updatedAt desc
           """)
    List<Connection> findAccepted(@Param("userId") UUID userId);

    long countByAddresseeIdAndStatus(UUID addresseeId, ConnectionStatus status);

    @Query("""
           select count(c) from Connection c
           where c.deletedAt is null
             and c.status = 'ACCEPTED'
             and (c.requester.id = :userId or c.addressee.id = :userId)
           """)
    long countAcceptedForUser(@Param("userId") UUID userId);

    /**
     * IDs that already have a non-CANCELLED, non-DECLINED relationship with
     * the viewer — used by "people you may know" to filter out anyone we've
     * already connected with, asked, or been asked by. CANCELLED/DECLINED
     * are excluded so the user gets to see them again as suggestions if
     * they re-emerge as a good match.
     */
    @Query("""
           select case when c.requester.id = :userId then c.addressee.id else c.requester.id end
           from Connection c
           where c.deletedAt is null
             and (c.requester.id = :userId or c.addressee.id = :userId)
             and (c.status = 'ACCEPTED' or c.status = 'PENDING')
           """)
    List<UUID> activeCounterpartiesOf(@Param("userId") UUID userId);
}
