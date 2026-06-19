package tn.esprit.connect.modules.job.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;

@Entity
@Table(name = "companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Company extends BaseEntity {

    @Column(nullable = false, unique = true, length = 160)
    private String name;

    @Column(length = 512)
    private String website;

    @Column(name = "logo_url", length = 512)
    private String logoUrl;

    @Column(length = 128)
    private String industry;
}
