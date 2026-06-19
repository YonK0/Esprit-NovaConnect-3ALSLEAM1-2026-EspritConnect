package tn.esprit.connect.modules.notification.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.notification.entity.Notification;
import tn.esprit.connect.modules.notification.repository.NotificationRepository;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;

    @Transactional
    public Notification create(UUID userId, String type, String title, String body, String link) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        Notification n = Notification.builder()
                .user(user).type(type).title(title).body(body).link(link).read(false)
                .build();
        return notificationRepository.save(n);
    }

    @Transactional(readOnly = true)
    public Page<Notification> list(UUID userId, Pageable pageable) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable);
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return notificationRepository.countByUserIdAndReadFalse(userId);
    }

    @Transactional
    public void markRead(UUID notificationId, UUID userId) {
        Notification n = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Notification", notificationId));
        if (!n.getUser().getId().equals(userId)) {
            throw new ResourceNotFoundException("Notification", notificationId);
        }
        n.setRead(true);
    }

    /** Bulk mark every unread notification for a user as read.
     *  Returns the number of rows touched. Used by the bell-dropdown
     *  "Mark all as read" button. */
    @Transactional
    public int markAllRead(UUID userId) {
        return notificationRepository.markAllReadFor(userId);
    }
}
