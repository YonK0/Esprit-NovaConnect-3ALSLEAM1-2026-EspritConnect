package tn.esprit.connect.modules.messaging.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.messaging.dto.MessagingDtos.*;
import tn.esprit.connect.modules.messaging.entity.Conversation;
import tn.esprit.connect.modules.messaging.entity.Message;
import tn.esprit.connect.modules.messaging.repository.ConversationRepository;
import tn.esprit.connect.modules.messaging.repository.MessageRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MessagingService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final tn.esprit.connect.modules.permissions.PermissionService permissionService;

    /**
     * Return the 1:1 conversation between the viewer and the other user, creating it
     * if it doesn't exist. Used by the "Message" button on profile / directory cards.
     */
    @Transactional
    public UUID findOrCreateConversation(UUID viewerId, UUID otherUserId) {
        if (viewerId.equals(otherUserId)) {
            throw new BusinessException("Cannot message yourself");
        }
        return conversationRepository.findOneToOne(viewerId, otherUserId)
                .map(Conversation::getId)
                .orElseGet(() -> {
                    User a = userRepository.findById(viewerId)
                            .orElseThrow(() -> new ResourceNotFoundException("User", viewerId));
                    User b = userRepository.findById(otherUserId)
                            .orElseThrow(() -> new ResourceNotFoundException("User", otherUserId));
                    Set<User> participants = new HashSet<>();
                    participants.add(a);
                    participants.add(b);
                    Conversation created = conversationRepository.save(Conversation.builder()
                            .participants(participants).build());
                    return created.getId();
                });
    }

    @Transactional
    public MessageResponse send(UUID senderId, SendMessageRequest req) {
        permissionService.require(senderId,
                tn.esprit.connect.modules.permissions.Permission.MESSAGING_SEND);
        if (senderId.equals(req.recipientId())) {
            throw new BusinessException("Cannot message yourself");
        }
        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new ResourceNotFoundException("User", senderId));
        User recipient = userRepository.findById(req.recipientId())
                .orElseThrow(() -> new ResourceNotFoundException("User", req.recipientId()));

        Conversation conv = conversationRepository.findOneToOne(senderId, req.recipientId())
                .orElseGet(() -> {
                    Set<User> participants = new HashSet<>();
                    participants.add(sender);
                    participants.add(recipient);
                    return conversationRepository.save(Conversation.builder()
                            .participants(participants).build());
                });

        Message msg = Message.builder()
                .conversation(conv).sender(sender).content(req.content()).read(false).build();
        msg = messageRepository.save(msg);

        conv.setLastMessageAt(Instant.now());

        notificationService.create(recipient.getId(), "MESSAGE_RECEIVED",
                "New message from " + sender.getEmail(), req.content(),
                "/messaging/" + conv.getId());

        return new MessageResponse(msg.getId(), conv.getId(), sender.getId(),
                msg.getContent(), msg.isRead(), msg.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public List<ConversationResponse> myConversations(UUID userId) {
        return conversationRepository.findForUser(userId).stream()
                .map(c -> {
                    User other = c.getParticipants().stream()
                            .filter(u -> !u.getId().equals(userId))
                            .findFirst().orElse(null);
                    return new ConversationResponse(c.getId(),
                            other == null ? null : other.getId(),
                            other == null ? null : other.getEmail(),
                            c.getLastMessageAt());
                }).toList();
    }

    @Transactional(readOnly = true)
    public List<MessageResponse> messages(UUID conversationId, UUID userId) {
        Conversation c = conversationRepository.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Conversation", conversationId));
        if (c.getParticipants().stream().noneMatch(u -> u.getId().equals(userId))) {
            throw new AccessDeniedException("Not a participant");
        }
        return messageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId).stream()
                .map(m -> new MessageResponse(m.getId(), c.getId(), m.getSender().getId(),
                        m.getContent(), m.isRead(), m.getCreatedAt()))
                .toList();
    }

    @Transactional
    public void markRead(UUID conversationId, UUID userId) {
        messageRepository.markRead(conversationId, userId);
    }
}
