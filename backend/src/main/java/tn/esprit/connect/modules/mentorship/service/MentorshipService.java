package tn.esprit.connect.modules.mentorship.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.mentorship.dto.MentorshipDtos.*;
import tn.esprit.connect.modules.mentorship.entity.*;
import tn.esprit.connect.modules.mentorship.repository.MentorProfileRepository;
import tn.esprit.connect.modules.mentorship.repository.MentorshipRequestRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MentorshipService {

    private final MentorProfileRepository mentorProfileRepository;
    private final MentorshipRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final tn.esprit.connect.modules.permissions.PermissionService permissionService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;

    @Transactional
    public MentorProfileResponse createOrUpdateMentorProfile(UUID userId,
                                                              CreateMentorProfileRequest req) {
        permissionService.require(userId, tn.esprit.connect.modules.permissions.Permission.MENTORSHIP_OFFER);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        MentorProfile mp = mentorProfileRepository.findByUserId(userId)
                .orElseGet(() -> MentorProfile.builder().user(user).build());
        mp.setBio(req.bio());
        mp.setExpertiseAreas(req.expertiseAreas());
        mp.setAvailabilityHours(req.availabilityHours());
        mp.setAcceptsFlash(req.acceptsFlash());
        mp = mentorProfileRepository.save(mp);
        return toMentorDto(mp);
    }

    @Transactional(readOnly = true)
    public Page<MentorProfileResponse> listMentors(UUID viewerId, Pageable pageable) {
        return mentorProfileRepository.findVisibleTo(viewerId, pageable).map(this::toMentorDto);
    }

    @Transactional
    public MentorshipRequestResponse requestMentorship(UUID menteeId, RequestMentorshipDto req) {
        permissionService.require(menteeId, tn.esprit.connect.modules.permissions.Permission.MENTORSHIP_REQUEST);
        MentorProfile mp = mentorProfileRepository.findById(req.mentorProfileId())
                .orElseThrow(() -> new ResourceNotFoundException("MentorProfile", req.mentorProfileId()));
        if (mp.getUser().getId().equals(menteeId)) {
            throw new BusinessException("Cannot request mentorship from yourself");
        }
        User mentee = userRepository.findById(menteeId)
                .orElseThrow(() -> new ResourceNotFoundException("User", menteeId));

        double score = computeMatchScore(mp, mentee);

        MentorshipRequest mr = MentorshipRequest.builder()
                .mentee(mentee).mentorProfile(mp).goals(req.goals()).type(req.type())
                .status(MentorshipStatus.PENDING).matchScore(score).build();
        mr = requestRepository.save(mr);

        notificationService.create(mp.getUser().getId(), "MENTORSHIP_REQUEST",
                "New mentorship request", mentee.getEmail() + " wants to be mentored by you",
                "/mentorship/requests/" + mr.getId());

        return toRequestDto(mr);
    }

    @Transactional
    public MentorshipRequestResponse updateStatus(UUID requestId, UUID userId,
                                                   UpdateRequestStatusDto req) {
        MentorshipRequest mr = requestRepository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("MentorshipRequest", requestId));
        if (!mr.getMentorProfile().getUser().getId().equals(userId)) {
            throw new AccessDeniedException("Only the mentor can update status");
        }
        mr.setStatus(req.status());
        if (req.status() == MentorshipStatus.ACCEPTED) {
            notificationService.create(mr.getMentee().getId(), "MENTORSHIP_ACCEPTED",
                    "Mentorship accepted", "Your request was accepted",
                    "/mentorship/requests/" + mr.getId());
            // Badge: HELPER for the mentor who took on a mentee.
            badgeService.onMentorshipAccepted(userId);
        }
        return toRequestDto(mr);
    }

    @Transactional(readOnly = true)
    public List<MentorshipRequestResponse> myRequestsAsMentee(UUID userId) {
        return requestRepository.findByMenteeId(userId).stream().map(this::toRequestDto).toList();
    }

    @Transactional(readOnly = true)
    public List<MentorshipRequestResponse> incomingRequestsForMentor(UUID userId) {
        return requestRepository.findByMentorProfileUserId(userId).stream()
                .map(this::toRequestDto).toList();
    }

    private double computeMatchScore(MentorProfile mp, User mentee) {
        // TODO real Jaccard on overlapping skills/specialty.
        return 0.85;
    }

    private MentorProfileResponse toMentorDto(MentorProfile mp) {
        var p = mp.getUser().getProfile();
        return new MentorProfileResponse(mp.getId(), mp.getUser().getId(),
                mp.getUser().getEmail(), mp.getBio(),
                mp.getExpertiseAreas(), mp.getAvailabilityHours(), mp.isAcceptsFlash(),
                mp.getModerationStatus(),
                p == null ? null : p.getFirstName(),
                p == null ? null : p.getLastName(),
                p == null ? null : p.getHeadline(),
                p == null ? null : p.getAvatarUrl());
    }

    private MentorshipRequestResponse toRequestDto(MentorshipRequest m) {
        return new MentorshipRequestResponse(m.getId(), m.getMentee().getId(),
                m.getMentorProfile().getId(), m.getGoals(), m.getType(),
                m.getStatus(), m.getMatchScore());
    }
}
