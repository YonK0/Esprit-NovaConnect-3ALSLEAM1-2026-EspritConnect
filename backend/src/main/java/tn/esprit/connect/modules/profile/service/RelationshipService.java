package tn.esprit.connect.modules.profile.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.modules.group.entity.GroupType;
import tn.esprit.connect.modules.profile.dto.RelationshipDtos.MutualConnection;
import tn.esprit.connect.modules.profile.dto.RelationshipDtos.SharedGroup;

import java.util.List;
import java.util.UUID;

/**
 * Mutual-connection and shared-group queries.
 * Done with native SQL because JPA does not express "users who share ≥1 group" cleanly.
 */
@Service
@RequiredArgsConstructor
public class RelationshipService {

    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<MutualConnection> mutualConnections(UUID viewerUserId, UUID targetUserId) {
        if (viewerUserId == null || viewerUserId.equals(targetUserId)) return List.of();
        String sql = """
            SELECT u.id, u.email, p.first_name, p.last_name, pr.year, s.code
            FROM users u
            JOIN profiles p   ON p.user_id = u.id
            LEFT JOIN promotions pr ON pr.id = p.promotion_id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            WHERE u.id <> ? AND u.id <> ? AND u.deleted_at IS NULL
              AND u.id IN (
                  SELECT gm.user_id FROM group_members gm
                  WHERE gm.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
                    AND gm.user_id IN (SELECT user_id FROM group_members WHERE group_id IN
                        (SELECT group_id FROM group_members WHERE user_id = ?))
              )
            LIMIT 50
            """;
        RowMapper<MutualConnection> rm = (rs, i) -> new MutualConnection(
                rs.getObject("id", UUID.class),
                rs.getString("email"),
                rs.getString("first_name"),
                rs.getString("last_name"),
                rs.getObject("year") == null ? null : rs.getInt("year"),
                rs.getString("code"));
        return jdbc.query(sql, rm, viewerUserId, targetUserId, viewerUserId, targetUserId);
    }

    @Transactional(readOnly = true)
    public List<SharedGroup> sharedGroups(UUID viewerUserId, UUID targetUserId) {
        if (viewerUserId == null || viewerUserId.equals(targetUserId)) return List.of();
        String sql = """
            SELECT g.id, g.name, g.type
            FROM groups g
            WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)
              AND g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)
              AND g.deleted_at IS NULL
              AND g.moderation_status = 'APPROVED'
            """;
        RowMapper<SharedGroup> rm = (rs, i) -> new SharedGroup(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                GroupType.valueOf(rs.getString("type")));
        return jdbc.query(sql, rm, viewerUserId, targetUserId);
    }
}
