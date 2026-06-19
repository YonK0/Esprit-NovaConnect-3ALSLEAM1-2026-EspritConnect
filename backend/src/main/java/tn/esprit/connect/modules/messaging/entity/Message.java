package tn.esprit.connect.modules.messaging.entity;

import jakarta.persistence.*;
import lombok.*;
import tn.esprit.connect.common.BaseEntity;
import tn.esprit.connect.modules.user.entity.User;

@Entity
@Table(name = "messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Message extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "is_read", nullable = false)
    private boolean read;
}
