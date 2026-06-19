package tn.esprit.connect.modules.group.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

import java.time.Instant;

@Entity
@Table(name = "group_invites",
       uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "invited_user_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupInvite extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invited_user_id", nullable = false)
    private User invitedUser;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invited_by_id", nullable = false)
    private User invitedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private InviteStatus status = InviteStatus.PENDING;

    @Column(name = "decided_at")
    private Instant decidedAt;
}
