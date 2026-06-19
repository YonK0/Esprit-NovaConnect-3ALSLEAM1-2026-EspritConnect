package tn.esprit.connect.modules.resource.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;

/**
 * A knowledge-resource folder (e.g. "PFE BOOK 23-24", "Alumni Spotlights").
 * The item count shown to viewers is derived at read time from the number of
 * APPROVED {@link ResourceItem}s — it is not stored here.
 */
@Entity
@Table(name = "resource_folders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResourceFolder extends BaseEntity {

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "cover_image_url", columnDefinition = "text")
    private String coverImageUrl;

    @Column(name = "owner_avatar_url", columnDefinition = "text")
    private String ownerAvatarUrl;
}
