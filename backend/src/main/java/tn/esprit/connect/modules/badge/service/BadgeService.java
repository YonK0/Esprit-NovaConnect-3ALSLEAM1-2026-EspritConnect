package tn.esprit.connect.modules.badge.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.modules.badge.entity.UserBadge;
import tn.esprit.connect.modules.badge.repository.UserBadgeRepository;
import tn.esprit.connect.modules.connection.repository.ConnectionRepository;
import tn.esprit.connect.modules.feed.repository.PostRepository;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Awards "trust signals" and engagement milestones to users — LinkedIn-style
 * gamification. Every award is idempotent (the {@link #award} method early-
 * exits if the user already has it) so callers can fire these hooks freely
 * from event handlers without worrying about duplicates.
 *
 * Badge codes are kept as strings here; the frontend
 * (profile.component.ts:badgeLabel) maps them to emoji + human labels.
 *
 * Full taxonomy:
 *   • Identity (proves who you are):
 *       VERIFIED      ✓  — passed the document + face verification.
 *       ALUMNI        🎓 — verified alumni role.
 *       MENTOR        🧑‍🏫 — verified mentor (or has a mentor profile).
 *       RECRUITER     💼 — verified recruiter.
 *   • Engagement (you've shown up):
 *       EARLY_BIRD    🐦 — joined in the first 100 users.
 *       CONNECTOR     🔗 — ≥10 accepted connections.
 *       SUPER_CONNECT 🌐 — ≥50 accepted connections.
 *       TOP_POSTER    📣 — ≥20 posts.
 *       INFLUENCER    🎯 — ≥50 posts.
 *       COMMUNITY     👥 — member of ≥3 approved groups.
 *       EVENT_GOER    🎟️ — ≥3 events RSVPd Going.
 *   • Quality (you've done the right things):
 *       COMPLETE_PROFILE ⭐ — headline + bio + avatar + ≥3 skills + ≥1 experience.
 *       HELPER          🤝 — accepted a mentorship request.
 *       HIRING_MAGNET   🧲 — recruiter who's posted ≥3 approved jobs.
 *       APPLICANT       📨 — applied to ≥3 jobs.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BadgeService {

    private final UserBadgeRepository badgeRepository;
    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final ConnectionRepository connectionRepository;
    private final ProfileRepository profileRepository;

    // ── Identity ────────────────────────────────────────────────────────────

    @Transactional
    public void onVerificationPassed(UUID userId) {
        award(userId, "VERIFIED");
        userRepository.findById(userId).ifPresent(u -> {
            if (u.getRole() == Role.ALUMNI)    award(userId, "ALUMNI");
            if (u.getRole() == Role.MENTOR)    award(userId, "MENTOR");
            if (u.getRole() == Role.RECRUITER) award(userId, "RECRUITER");
        });
    }

    @Transactional
    public void onMentorProfileCreated(UUID userId) {
        award(userId, "MENTOR");
    }

    /** Mentor accepted a mentee — the "HELPER" badge. */
    @Transactional
    public void onMentorshipAccepted(UUID mentorUserId) {
        award(mentorUserId, "HELPER");
    }

    // ── Engagement ─────────────────────────────────────────────────────────

    @Transactional
    public void onConnectionAccepted(UUID userId) {
        long count = connectionRepository.countAcceptedForUser(userId);
        if (count >= 10)  award(userId, "CONNECTOR");
        if (count >= 50)  award(userId, "SUPER_CONNECT");
    }

    @Transactional
    public void onPostCreated(UUID userId) {
        long count = postRepository.countByAuthorIdAndDeletedAtIsNull(userId);
        if (count >= 20) award(userId, "TOP_POSTER");
        if (count >= 50) award(userId, "INFLUENCER");
        // First 100 users get EARLY_BIRD on their first activity.
        if (userRepository.count() <= 100) award(userId, "EARLY_BIRD");

        // First-post check piggy-backs on this hook too — re-evaluate the
        // "complete profile" badge since adding a post bumps activity.
        maybeAwardCompleteProfile(userId);
    }

    /** Called after every group join + leave; awards COMMUNITY at 3 groups. */
    @Transactional
    public void onGroupJoined(UUID userId, long currentGroupCount) {
        if (currentGroupCount >= 3) award(userId, "COMMUNITY");
    }

    /** Called after every "GOING" RSVP; awards EVENT_GOER at 3. */
    @Transactional
    public void onEventGoing(UUID userId, long currentGoingCount) {
        if (currentGoingCount >= 3) award(userId, "EVENT_GOER");
    }

    /** Recruiter posted a job that's now APPROVED → counts toward HIRING_MAGNET. */
    @Transactional
    public void onJobApproved(UUID recruiterUserId, long approvedJobsByThisRecruiter) {
        if (approvedJobsByThisRecruiter >= 3) award(recruiterUserId, "HIRING_MAGNET");
    }

    /** Mentee/student submitted a job application — counts toward APPLICANT. */
    @Transactional
    public void onJobApplied(UUID userId, long totalApplicationsByThisUser) {
        if (totalApplicationsByThisUser >= 3) award(userId, "APPLICANT");
    }

    // ── Profile completeness ───────────────────────────────────────────────

    /** Re-evaluate the COMPLETE_PROFILE badge — safe to call any time the
     *  user touches their profile (edit, add skill, add experience, etc.).
     *  Requirements: headline + bio + avatar + ≥3 skills + ≥1 experience. */
    @Transactional
    public void maybeAwardCompleteProfile(UUID userId) {
        Profile p = profileRepository.findByUserId(userId).orElse(null);
        if (p == null) return;
        boolean ok = nonBlank(p.getHeadline())
                && nonBlank(p.getBio())
                && nonBlank(p.getAvatarUrl())
                && p.getSkills() != null && p.getSkills().size() >= 3
                && p.getExperiences() != null && !p.getExperiences().isEmpty();
        if (ok) award(userId, "COMPLETE_PROFILE");
    }

    // ── Read API ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<BadgeDto> badgesFor(UUID userId) {
        return badgeRepository.findByUserId(userId).stream()
                .map(b -> new BadgeDto(b.getBadgeCode(), b.getAwardedAt()))
                .toList();
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private void award(UUID userId, String code) {
        if (badgeRepository.existsByUserIdAndBadgeCode(userId, code)) return;
        User u = userRepository.getReferenceById(userId);
        badgeRepository.save(UserBadge.builder()
                .user(u).badgeCode(code).awardedAt(Instant.now()).build());
        log.info("Awarded badge {} to user {}", code, userId);
    }

    private static boolean nonBlank(String s) { return s != null && !s.isBlank(); }

    public record BadgeDto(String code, Instant awardedAt) {}
}
