package tn.esprit.connect.modules.profile.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;

@Entity
@Table(name = "skills",
       uniqueConstraints = @UniqueConstraint(columnNames = {"profile_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Skill extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false)
    private Integer level;
}
