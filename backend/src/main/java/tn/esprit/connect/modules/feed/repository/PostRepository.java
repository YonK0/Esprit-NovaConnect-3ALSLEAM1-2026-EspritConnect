package tn.esprit.connect.modules.feed.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.feed.entity.Post;

import java.util.UUID;

@Repository
public interface PostRepository extends JpaRepository<Post, UUID> {
    @Query("select p from Post p where p.deletedAt is null and p.group is null order by p.createdAt desc")
    Page<Post> findFeed(Pageable pageable);

    @Query("select p from Post p where p.author.id = :authorId and p.deletedAt is null order by p.createdAt desc")
    Page<Post> findByAuthorId(@org.springframework.data.repository.query.Param("authorId") UUID authorId, Pageable pageable);

    long countByAuthorIdAndDeletedAtIsNull(UUID authorId);

    @Query("select p from Post p where p.group.id = :groupId and p.deletedAt is null "
           + "order by p.createdAt desc")
    Page<Post> findByGroupId(
            @org.springframework.data.repository.query.Param("groupId") UUID groupId,
            Pageable pageable);

    long countByGroupIdAndDeletedAtIsNull(UUID groupId);

    /** How many reposts point at this original — used as the "shares" count. */
    long countByOriginalPostId(UUID originalPostId);
}
