package tn.esprit.connect.modules.profile.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;

@Entity
@Table(name = "promotions", uniqueConstraints = @UniqueConstraint(columnNames = {"year", "department"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Promotion extends BaseEntity {

    @Column(nullable = false)
    private Integer year;

    @Column(length = 64)
    private String department;
}
