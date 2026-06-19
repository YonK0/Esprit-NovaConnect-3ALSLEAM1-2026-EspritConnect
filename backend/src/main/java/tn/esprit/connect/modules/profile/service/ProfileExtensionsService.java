package tn.esprit.connect.modules.profile.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.connection.entity.ConnectionStatus;
import tn.esprit.connect.modules.connection.repository.ConnectionRepository;
import tn.esprit.connect.modules.mentorship.entity.MentorshipStatus;
import tn.esprit.connect.modules.mentorship.repository.MentorshipRequestRepository;
import tn.esprit.connect.modules.ai.RecommendationService;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobMatchRecommendation;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.UserJobRecommendations;
import tn.esprit.connect.modules.notification.service.NotificationService;
import tn.esprit.connect.modules.profile.dto.ProfileExtensionsDtos.*;
import tn.esprit.connect.modules.profile.entity.*;
import tn.esprit.connect.modules.profile.repository.*;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileExtensionsService {

    private final ProfileRepository profileRepository;
    private final ExperienceRepository experienceRepository;
    private final AchievementRepository achievementRepository;
    private final SkillRepository skillRepository;
    private final EndorsementRepository endorsementRepository;
    private final UserRepository userRepository;
    private final ConnectionRepository connectionRepository;
    private final MentorshipRequestRepository mentorshipRequestRepository;
    private final NotificationService notificationService;
    private final RecommendationService recommendationService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;

    private static final int MAX_ENDORSERS_SHOWN = 5;

    // ---------------- Experience ----------------

    @Transactional
    public ExperienceResponse addExperience(UUID userId, CreateExperience req) {
        Profile p = profileForUser(userId);
        Experience e = Experience.builder()
                .profile(p).title(req.title()).company(req.company())
                .location(req.location()).startDate(req.startDate()).endDate(req.endDate())
                .description(req.description()).build();
        e = experienceRepository.save(e);
        badgeService.maybeAwardCompleteProfile(userId);
        return toExperience(e);
    }

    @Transactional
    public ExperienceResponse updateExperience(UUID userId, UUID expId, UpdateExperience req) {
        Experience e = experienceRepository.findById(expId)
                .orElseThrow(() -> new ResourceNotFoundException("Experience", expId));
        assertOwner(e.getProfile(), userId);
        if (req.title() != null)       e.setTitle(req.title());
        if (req.company() != null)     e.setCompany(req.company());
        if (req.location() != null)    e.setLocation(req.location());
        if (req.startDate() != null)   e.setStartDate(req.startDate());
        if (req.endDate() != null)     e.setEndDate(req.endDate());
        if (req.description() != null) e.setDescription(req.description());
        return toExperience(e);
    }

    @Transactional
    public void deleteExperience(UUID userId, UUID expId) {
        Experience e = experienceRepository.findById(expId)
                .orElseThrow(() -> new ResourceNotFoundException("Experience", expId));
        assertOwner(e.getProfile(), userId);
        experienceRepository.delete(e);
    }

    @Transactional(readOnly = true)
    public List<ExperienceResponse> experiencesOfProfile(UUID profileId) {
        return experienceRepository.findByProfileIdOrderByStartDateDesc(profileId)
                .stream().map(this::toExperience).toList();
    }

    // ---------------- Achievement ----------------

    @Transactional
    public AchievementResponse addAchievement(UUID userId, CreateAchievement req) {
        Profile p = profileForUser(userId);
        Achievement a = achievementRepository.save(Achievement.builder()
                .profile(p).title(req.title()).subtitle(req.subtitle()).period(req.period())
                .build());
        return toAchievement(a);
    }

    @Transactional
    public void deleteAchievement(UUID userId, UUID id) {
        Achievement a = achievementRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Achievement", id));
        assertOwner(a.getProfile(), userId);
        achievementRepository.delete(a);
    }

    @Transactional(readOnly = true)
    public List<AchievementResponse> achievementsOfProfile(UUID profileId) {
        return achievementRepository.findByProfileIdOrderByCreatedAtDesc(profileId)
                .stream().map(this::toAchievement).toList();
    }

    // ---------------- Skill + endorsement ----------------

    @Transactional
    public SkillResponse addSkill(UUID userId, CreateSkill req) {
        Profile p = profileForUser(userId);
        // upsert (profile, name)
        Skill skill = p.getSkills().stream()
                .filter(s -> s.getName().equalsIgnoreCase(req.name()))
                .findFirst()
                .orElseGet(() -> Skill.builder().profile(p).name(req.name()).level(req.level()).build());
        skill.setLevel(req.level());
        skill = skillRepository.save(skill);
        badgeService.maybeAwardCompleteProfile(userId);
        return toSkill(skill, userId);
    }

    @Transactional
    public void deleteSkill(UUID userId, UUID skillId) {
        Skill s = skillRepository.findById(skillId)
                .orElseThrow(() -> new ResourceNotFoundException("Skill", skillId));
        assertOwner(s.getProfile(), userId);
        skillRepository.delete(s);
    }

    @Transactional(readOnly = true)
    public List<SkillResponse> skillsOfProfile(UUID profileId, UUID viewerUserId) {
        Profile owner = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile", profileId));
        UUID ownerUserId = owner.getUser().getId();
        return skillRepository.findByProfileIdOrderByName(profileId)
                .stream()
                .map(s -> toSkill(s, viewerUserId, ownerUserId))
                .toList();
    }

    @Transactional
    public void endorse(UUID endorserUserId, UUID skillId) {
        Skill skill = skillRepository.findById(skillId)
                .orElseThrow(() -> new ResourceNotFoundException("Skill", skillId));
        UUID ownerUserId = skill.getProfile().getUser().getId();
        if (ownerUserId.equals(endorserUserId)) {
            throw new BusinessException("You cannot recommend your own skill");
        }
        if (!canRecommend(endorserUserId, ownerUserId)) {
            throw new BusinessException(
                    "Only your connections or mentorship partners can recommend your skills");
        }
        if (endorsementRepository.findBySkillIdAndEndorserId(skillId, endorserUserId).isPresent()) {
            throw new BusinessException("Already recommended");
        }
        User endorser = userRepository.findById(endorserUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", endorserUserId));
        endorsementRepository.save(Endorsement.builder()
                .skill(skill).endorser(endorser).build());
        notifySkillRecommendation(ownerUserId, endorserUserId, endorser, skill.getName());
    }

    private void notifySkillRecommendation(UUID ownerUserId, UUID endorserUserId,
                                           User endorser, String skillName) {
        String endorserName = profileRepository.findByUserId(endorserUserId)
                .map(p -> (p.getFirstName() + " " + p.getLastName()).trim())
                .filter(n -> !n.isBlank())
                .orElse(endorser.getEmail());
        notificationService.create(
                ownerUserId,
                "SKILL_RECOMMENDATION",
                endorserName + " recommended your skill",
                "\"" + skillName + "\"",
                "/profile/me");
    }

    @Transactional
    public void removeEndorsement(UUID endorserUserId, UUID skillId) {
        Endorsement e = endorsementRepository.findBySkillIdAndEndorserId(skillId, endorserUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Endorsement", skillId));
        endorsementRepository.delete(e);
    }

    // ---------------- CV URL ----------------

    @Transactional
    public void setCvUrl(UUID userId, String cvUrl) {
        Profile p = profileForUser(userId);
        p.setCvUrl(cvUrl);
    }

    // ---------------- CV import (after PDF parse) ----------------

    /** Apply a previously-parsed-and-edited CvImportRequest to the user's profile.
     * Idempotency: skills are upserted by name (case-insensitive); experiences and
     * achievements (education) are appended — there's no reliable natural key for
     * them, so duplicates are the user's responsibility (the preview UI lets them
     * de-select rows before commit). */
    @Transactional
    public tn.esprit.connect.modules.profile.dto.CvImportDtos.CvImportResult importCv(
            UUID userId,
            tn.esprit.connect.modules.profile.dto.CvImportDtos.CvImportRequest req) {

        Profile p = profileForUser(userId);

        // Headline + bio: apply only when the request explicitly opted in
        // AND a non-blank value was supplied. Truncate to column limits
        // (headline=160, bio=2000) so an over-long AI-generated headline
        // doesn't trigger a 500 on the JPA flush.
        boolean headlineUpdated = false;
        if (req.importHeadline() && req.headline() != null && !req.headline().isBlank()) {
            String h = req.headline().trim();
            if (h.length() > 160) h = h.substring(0, 157) + "…";
            p.setHeadline(h);
            headlineUpdated = true;
        }
        boolean summaryUpdated = false;
        if (req.importSummary() && req.summary() != null && !req.summary().isBlank()) {
            String b = req.summary().trim();
            if (b.length() > 2000) b = b.substring(0, 1997) + "…";
            p.setBio(b);
            summaryUpdated = true;
        }

        int expAdded = 0;
        if (req.experiences() != null) {
            for (var e : req.experiences()) {
                experienceRepository.save(Experience.builder()
                        .profile(p)
                        .title(clip(blankToDash(e.title()), 160))
                        .company(clip(blankToDash(e.company()), 160))
                        .location(clip(e.location(), 160))
                        // The Experience entity's start_date is NOT NULL. The
                        // CV parser may legitimately not find a start date; fall
                        // back to "today" so the import doesn't crash.
                        .startDate(e.startDate() == null
                                ? java.time.LocalDate.now() : e.startDate())
                        .endDate(e.endDate())
                        .description(e.description())
                        .build());
                expAdded++;
            }
        }

        // Skills: a single LLM-extracted "skill" row often is actually a list
        // like "Backend: Java, Spring, PostgreSQL" or "Programming Languages
        // (C, C++, Java, Python)". Split on common separators, strip stray
        // parens, then de-dup against (a) the user's existing skills AND
        // (b) what we've already queued in THIS batch — so two CV rows that
        // both mention "C++" don't trip the unique constraint
        // skills_profile_id_name_key on the second insert.
        int skillsAdded = 0;
        java.util.Set<String> seenInBatch = new java.util.HashSet<>();
        // Seed with the user's existing skills (case-insensitive)
        for (var existing : p.getSkills()) {
            seenInBatch.add(existing.getName().toLowerCase(java.util.Locale.ROOT));
        }
        if (req.skills() != null) {
            for (var s : req.skills()) {
                String raw = s.name() == null ? "" : s.name().trim();
                if (raw.isEmpty()) continue;
                Integer level = s.level() != null ? s.level() : 3;
                for (String chunk : splitSkillTokens(raw)) {
                    String name = chunk.length() > 80 ? chunk.substring(0, 80) : chunk;
                    String key = name.toLowerCase(java.util.Locale.ROOT);
                    if (!seenInBatch.add(key)) continue;   // already saved / will be saved
                    skillRepository.save(Skill.builder().profile(p).name(name).level(level).build());
                    skillsAdded++;
                }
            }
        }

        int eduAdded = 0;
        if (req.education() != null) {
            for (var ed : req.education()) {
                String title = ed.title() == null ? "" : ed.title().trim();
                if (title.isEmpty()) continue;
                achievementRepository.save(Achievement.builder()
                        .profile(p)
                        .title(clip(title, 160))
                        .subtitle(clip(ed.subtitle(), 200))
                        .period(clip(ed.period(), 64))
                        .build());
                eduAdded++;
            }
        }

        // Re-evaluate badge after a bulk CV import — most likely outcome
        // is the user just earned COMPLETE_PROFILE.
        badgeService.maybeAwardCompleteProfile(userId);

        UserJobRecommendations jobRecs = recommendationService.recommendJobsForUser(userId);
        List<JobMatchRecommendation> suggested = jobRecs.jobs().stream().limit(8).toList();
        recommendationService.notifyUserOfCvJobMatches(userId);

        return new tn.esprit.connect.modules.profile.dto.CvImportDtos.CvImportResult(
                expAdded, skillsAdded, eduAdded, headlineUpdated, summaryUpdated, suggested);
    }

    private static String blankToDash(String s) {
        return (s == null || s.isBlank()) ? "—" : s;
    }

    /** Truncate a string to fit the destination column. Null in → null out. */
    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    /**
     * Break a free-form CV skill line into individual atomic skills.
     *
     * The LLM often returns one row like:
     *   - "Backend: Java, Spring, PostgreSQL"                (colon + commas)
     *   - "Programming Languages (C, C++, Java, Python)"     (paren-wrapped list)
     *   - "Frameworks / Tools — Git · Docker · CI"           (slash + bullets)
     *
     * Steps:
     *   1. Drop a short "Category:" prefix when it's followed by a comma-list.
     *   2. Drop the parent prefix when the rest of the line is wrapped in
     *      "( … )" — i.e. promote the parenthesized list to top level.
     *   3. Split on , ; | / • · — leftover separators between items.
     *   4. Strip stray quotes / parens / dots from each token's edges, so
     *      "(C" and "Python)" become "C" and "Python".
     */
    private static java.util.List<String> splitSkillTokens(String raw) {
        String body = raw;

        // 1. "Backend: Java, Spring" → "Java, Spring"
        int colon = body.indexOf(':');
        if (colon > 0 && colon < 40 && body.indexOf(',', colon) > 0) {
            body = body.substring(colon + 1);
        }

        // 2. "Programming Languages (C, C++, Java)" → "C, C++, Java"
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("^[^()]+\\(([^)]+)\\)\\s*$")
                .matcher(body.trim());
        if (m.matches()) body = m.group(1);

        java.util.List<String> out = new java.util.ArrayList<>();
        for (String chunk : body.split("[,;|/•·]")) {
            // 4. Trim trailing/leading parens, quotes, dots, dashes, whitespace.
            String c = chunk.trim()
                    .replaceAll("^[\\s()\"'\\-.]+", "")
                    .replaceAll("[\\s()\"'\\-.]+$", "")
                    .trim();
            // Skip stray punctuation-only tokens and tokens < 2 chars
            // (would be "C" alone, which is ambiguous, but we still keep
            // common 2-char skills like "JS" or "Go" with our >=2 floor).
            if (c.length() >= 2) out.add(c);
        }
        return out.isEmpty() ? java.util.List.of(raw.length() > 80
                ? raw.substring(0, 80) : raw) : out;
    }

    // ---------------- Helpers ----------------

    private Profile profileForUser(UUID userId) {
        return profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile for user", userId));
    }

    private void assertOwner(Profile p, UUID userId) {
        if (!p.getUser().getId().equals(userId)) {
            throw new AccessDeniedException("Not your profile");
        }
    }

    private ExperienceResponse toExperience(Experience e) {
        return new ExperienceResponse(e.getId(), e.getTitle(), e.getCompany(), e.getLocation(),
                e.getStartDate(), e.getEndDate(), e.getDescription());
    }

    private AchievementResponse toAchievement(Achievement a) {
        return new AchievementResponse(a.getId(), a.getTitle(), a.getSubtitle(),
                a.getPeriod(), a.getCreatedAt());
    }

    private boolean canRecommend(UUID endorserUserId, UUID ownerUserId) {
        if (endorserUserId.equals(ownerUserId)) {
            return false;
        }
        boolean connected = connectionRepository.findBetween(endorserUserId, ownerUserId)
                .map(c -> c.getStatus() == ConnectionStatus.ACCEPTED)
                .orElse(false);
        if (connected) {
            return true;
        }
        return mentorshipRequestRepository.existsAcceptedBetween(
                endorserUserId, ownerUserId, MentorshipStatus.ACCEPTED);
    }

    private SkillResponse toSkill(Skill s, UUID viewerUserId) {
        UUID ownerUserId = s.getProfile().getUser().getId();
        return toSkill(s, viewerUserId, ownerUserId);
    }

    private SkillResponse toSkill(Skill s, UUID viewerUserId, UUID ownerUserId) {
        long count = endorsementRepository.countBySkillId(s.getId());
        boolean endorsedByMe = viewerUserId != null
                && endorsementRepository.findBySkillIdAndEndorserId(s.getId(), viewerUserId).isPresent();
        boolean canEndorse = viewerUserId != null
                && !viewerUserId.equals(ownerUserId)
                && canRecommend(viewerUserId, ownerUserId)
                && !endorsedByMe;
        List<SkillEndorserSummary> endorsers = endorsementRepository
                .findBySkillIdOrderByCreatedAtDesc(s.getId())
                .stream()
                .limit(MAX_ENDORSERS_SHOWN)
                .map(e -> toEndorserSummary(e.getEndorser()))
                .toList();
        return new SkillResponse(
                s.getId(), s.getName(), s.getLevel(), count,
                endorsedByMe, canEndorse, endorsers);
    }

    private SkillEndorserSummary toEndorserSummary(User endorser) {
        Profile p = profileRepository.findByUserId(endorser.getId()).orElse(null);
        if (p != null) {
            return new SkillEndorserSummary(p.getUser().getId(), p.getFirstName(), p.getLastName());
        }
        return new SkillEndorserSummary(endorser.getId(), "", endorser.getEmail());
    }
}
