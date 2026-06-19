package tn.esprit.connect.modules.event.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.profile.entity.Profile;

@Entity
@Table(name = "event_speakers")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EventSpeaker extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id", nullable = false)
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id")
    private Profile profile;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 160)
    private String role;

    @Column(length = 160)
    private String company;

    @Column(columnDefinition = "text")
    private String bio;

    @Column(name = "avatar_url", length = 512)
    private String avatarUrl;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
