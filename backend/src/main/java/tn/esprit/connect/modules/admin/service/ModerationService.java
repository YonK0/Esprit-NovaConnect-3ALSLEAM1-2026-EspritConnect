package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.admin.dto.ModerationDtos.ModerationItem;
import tn.esprit.connect.modules.ai.RecommendationService;
import tn.esprit.connect.modules.event.entity.Event;
import tn.esprit.connect.modules.event.repository.EventRepository;
import tn.esprit.connect.modules.event.service.EventMatchService;
import tn.esprit.connect.modules.group.entity.Group;
import tn.esprit.connect.modules.group.repository.GroupRepository;
import tn.esprit.connect.modules.job.entity.JobOffer;
import tn.esprit.connect.modules.job.repository.JobOfferRepository;
import tn.esprit.connect.modules.mentorship.entity.MentorProfile;
import tn.esprit.connect.modules.mentorship.repository.MentorProfileRepository;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.modules.notification.service.NotificationService;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class ModerationService {

    private final JobOfferRepository jobOfferRepository;
    private final EventRepository eventRepository;
    private final GroupRepository groupRepository;
    private final MentorProfileRepository mentorProfileRepository;
    private final AdminService adminService;
    private final NotificationService notificationService;
    private final RecommendationService recommendationService;
    private final EventMatchService eventMatchService;
    private final MailService mailService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;

    public enum ContentType { JOB, EVENT, GROUP, MENTOR_PROFILE }

    @Transactional(readOnly = true)
    public Page<ModerationItem> list(ContentType type, ModerationStatus status, Pageable p) {
        return switch (type) {
            case JOB -> jobOfferRepository
                    .findByModerationStatusOrderByCreatedAtDesc(status, p)
                    .map(this::toItem);
            case EVENT -> eventRepository
                    .findByModerationStatusOrderByCreatedAtDesc(status, p)
                    .map(this::toItem);
            case GROUP -> groupRepository
                    .findByModerationStatusOrderByCreatedAtDesc(status, p)
                    .map(this::toItem);
            case MENTOR_PROFILE -> mentorProfileRepository
                    .findByModerationStatusOrderByCreatedAtDesc(status, p)
                    .map(this::toItem);
        };
    }

    @Transactional
    public void approve(ContentType type, UUID id, UUID adminId) {
        decide(type, id, adminId, ModerationStatus.APPROVED, "MODERATION_APPROVED", null);
    }

    @Transactional
    public void reject(ContentType type, UUID id, UUID adminId, String reason) {
        decide(type, id, adminId, ModerationStatus.REJECTED,
                "MODERATION_REJECTED" + (reason == null ? "" : (": " + reason)),
                reason);
    }

    /** Holds the per-content-type info we need to build the email + notification. */
    private record OwnerInfo(UUID ownerId, String ownerEmail, String typeLabel, String title) {}

    private void decide(ContentType type, UUID id, UUID adminId,
                         ModerationStatus newStatus, String auditAction,
                         String rejectionReason) {
        OwnerInfo info;
        switch (type) {
            case JOB -> {
                JobOffer j = jobOfferRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("JobOffer", id));
                if (j.getModerationStatus() == newStatus) {
                    throw new BusinessException("Already " + newStatus);
                }
                j.setModerationStatus(newStatus);
                info = new OwnerInfo(j.getPostedBy().getId(), j.getPostedBy().getEmail(),
                        "job offer", j.getTitle());
            }
            case EVENT -> {
                Event e = eventRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("Event", id));
                e.setModerationStatus(newStatus);
                info = new OwnerInfo(e.getOrganizer().getId(), e.getOrganizer().getEmail(),
                        "event", e.getTitle());
            }
            case GROUP -> {
                Group g = groupRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("Group", id));
                g.setModerationStatus(newStatus);
                info = new OwnerInfo(g.getOwner().getId(), g.getOwner().getEmail(),
                        "group", g.getName());
            }
            case MENTOR_PROFILE -> {
                MentorProfile mp = mentorProfileRepository.findById(id)
                        .orElseThrow(() -> new ResourceNotFoundException("MentorProfile", id));
                mp.setModerationStatus(newStatus);
                info = new OwnerInfo(mp.getUser().getId(), mp.getUser().getEmail(),
                        "mentor profile", "Mentor profile");
            }
            default -> throw new BusinessException("Unknown content type");
        }

        adminService.log(adminId, auditAction,
                Map.of("type", type.name(), "id", id.toString()));

        // In-app notification — shows up in the bell dropdown.
        notificationService.create(info.ownerId(),
                newStatus == ModerationStatus.APPROVED ? "MODERATION_APPROVED" : "MODERATION_REJECTED",
                "Your " + info.typeLabel() + " was " + newStatus.name().toLowerCase(),
                newStatus == ModerationStatus.APPROVED
                        ? "It is now visible to the network."
                        : "An admin rejected this submission.",
                pathFor(type, id));

        // Email — survives the user being offline. Failures are swallowed
        // inside MailService so a mail glitch can't unwind the admin's
        // approve/reject transaction.
        if (newStatus == ModerationStatus.APPROVED) {
            mailService.sendContentApprovedEmail(info.ownerEmail(),
                    info.typeLabel(), info.title(), pathFor(type, id));
        } else {
            mailService.sendContentRejectedEmail(info.ownerEmail(),
                    info.typeLabel(), info.title(), rejectionReason);
        }

        // When a JOB is approved, asynchronously ask Ollama for matches and notify them.
        if (type == ContentType.JOB && newStatus == ModerationStatus.APPROVED) {
            // Badge hook for recruiters — HIRING_MAGNET at 3+ approved jobs.
            long approvedJobs = jobOfferRepository.countByPostedByIdAndModerationStatus(
                    info.ownerId(), ModerationStatus.APPROVED);
            badgeService.onJobApproved(info.ownerId(), approvedJobs);

            CompletableFuture.runAsync(() -> {
                try {
                    recommendationService.notifyMatchedCandidates(id);
                } catch (Exception e) {
                    log.warn("Async auto-notify for job {} failed: {}", id, e.getMessage());
                }
            });
        }
        // When an EVENT is approved, asynchronously find profiles it matches
        // and email them "this event might be for you" (Feature-1).
        if (type == ContentType.EVENT && newStatus == ModerationStatus.APPROVED) {
            CompletableFuture.runAsync(() -> {
                try {
                    eventMatchService.matchAndEmail(id);
                } catch (Exception e) {
                    log.warn("Event match email for {} failed: {}", id, e.getMessage());
                }
            });
        }
        // Mentor-profile approval is a verification proof → MENTOR badge.
        if (type == ContentType.MENTOR_PROFILE && newStatus == ModerationStatus.APPROVED) {
            badgeService.onMentorProfileCreated(info.ownerId());
        }
    }

    private String pathFor(ContentType type, UUID id) {
        return switch (type) {
            case JOB -> "/jobs";
            case EVENT -> "/events";
            case GROUP -> "/groups";
            case MENTOR_PROFILE -> "/mentorship";
        };
    }

    private ModerationItem toItem(JobOffer j) {
        return new ModerationItem(j.getId(), "JOB", j.getTitle(),
                truncate(j.getDescription()),
                j.getPostedBy().getId(), j.getPostedBy().getEmail(),
                j.getModerationStatus(), j.getCreatedAt());
    }

    private ModerationItem toItem(Event e) {
        return new ModerationItem(e.getId(), "EVENT", e.getTitle(),
                truncate(e.getDescription()),
                e.getOrganizer().getId(), e.getOrganizer().getEmail(),
                e.getModerationStatus(), e.getCreatedAt());
    }

    private ModerationItem toItem(Group g) {
        return new ModerationItem(g.getId(), "GROUP", g.getName(),
                truncate(g.getDescription()),
                g.getOwner().getId(), g.getOwner().getEmail(),
                g.getModerationStatus(), g.getCreatedAt());
    }

    private ModerationItem toItem(MentorProfile mp) {
        return new ModerationItem(mp.getId(), "MENTOR_PROFILE",
                mp.getUser().getEmail() + " — mentor profile",
                truncate(mp.getBio()),
                mp.getUser().getId(), mp.getUser().getEmail(),
                mp.getModerationStatus(), mp.getCreatedAt());
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() <= 200 ? s : s.substring(0, 200) + "…";
    }
}
