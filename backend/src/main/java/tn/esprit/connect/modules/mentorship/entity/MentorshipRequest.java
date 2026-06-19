package tn.esprit.connect.modules.mentorship.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "mentorship_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MentorshipRequest extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "mentee_id", nullable = false)
    private User mentee;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "mentor_profile_id", nullable = false)
    private MentorProfile mentorProfile;

    @Column(columnDefinition = "text")
    private String goals;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private MentorshipType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private MentorshipStatus status;

    @Column(name = "match_score")
    private Double matchScore;

    @OneToMany(mappedBy = "request", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<MentorshipSession> sessions = new HashSet<>();
}
