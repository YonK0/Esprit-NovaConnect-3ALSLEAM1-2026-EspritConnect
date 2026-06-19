package tn.esprit.connect.modules.mentorship.entity;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Type;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.user.entity.User;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "mentor_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MentorProfile extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", unique = true, nullable = false)
    private User user;

    @Column(columnDefinition = "text")
    private String bio;

    @Type(JsonType.class)
    @Column(name = "expertise_areas", columnDefinition = "jsonb")
    @Builder.Default
    private List<String> expertiseAreas = new ArrayList<>();

    @Column(name = "availability_hours")
    private Integer availabilityHours;

    @Column(name = "accepts_flash", nullable = false)
    private boolean acceptsFlash;

    @Enumerated(EnumType.STRING)
    @Column(name = "moderation_status", nullable = false, length = 32)
    @Builder.Default
    private ModerationStatus moderationStatus = ModerationStatus.PENDING;
}
