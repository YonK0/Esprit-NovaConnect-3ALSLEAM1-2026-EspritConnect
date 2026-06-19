package tn.esprit.connect.modules.event.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

import java.time.Instant;

@Entity
@Table(name = "event_rsvps",
       uniqueConstraints = @UniqueConstraint(columnNames = {"event_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EventRsvp extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private RsvpStatus status;

    @Column(name = "responded_at", nullable = false)
    private Instant respondedAt;

    /** Organizer's decision on this RSVP. Orthogonal to `status` — an
     *  attendee can have status=GOING and approval=PENDING. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private RsvpApproval approval = RsvpApproval.PENDING;

    @Column(name = "approval_decided_at")
    private Instant approvalDecidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approval_decided_by")
    private User approvalDecidedBy;
}
