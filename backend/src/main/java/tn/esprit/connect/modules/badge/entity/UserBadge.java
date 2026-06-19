package tn.esprit.connect.modules.badge.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

import java.time.Instant;

@Entity
@Table(name = "user_badges",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "badge_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserBadge extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "badge_code", nullable = false, length = 32)
    private String badgeCode;

    @Column(name = "awarded_at", nullable = false)
    private Instant awardedAt;
}
