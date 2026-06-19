package tn.esprit.connect.modules.resource.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.common.moderation.ModerationStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * A file or link inside a {@link ResourceFolder}. Visibility is governed by
 * {@link #status}: APPROVED items are public; PENDING items are only visible to
 * their submitter (and to admins in the review queue); REJECTED items are hidden.
 *
 * The status is derived server-side from the submitter's role on creation
 * (students → PENDING, everyone else → APPROVED) — never trusted from the client.
 */
@Entity
@Table(name = "resource_items", indexes = {
        @Index(name = "idx_resource_items_folder", columnList = "folder_id"),
        @Index(name = "idx_resource_items_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResourceItem extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "folder_id", nullable = false)
    private ResourceFolder folder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ResourceItemType type;

    @Column(nullable = false, length = 255)
    private String title;

    /** Public URL — the stored file's URL (FILE) or the external link (LINK). */
    @Column(columnDefinition = "text")
    private String url;

    @Column(name = "file_type", length = 100)
    private String fileType;

    /** Size in bytes for uploaded files; null for links. */
    @Column
    private Long size;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    @Builder.Default
    private ModerationStatus status = ModerationStatus.PENDING;

    @Column(name = "submitted_by")
    private UUID submittedBy;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "rejection_reason", columnDefinition = "text")
    private String rejectionReason;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;
}
