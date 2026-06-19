package tn.esprit.connect.modules.profile.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;

@Entity
@Table(name = "achievements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Achievement extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 200)
    private String subtitle;

    /** Free-form e.g. "Q1 2026" or "Career Day · 4x" */
    @Column(length = 64)
    private String period;
}
