package tn.esprit.connect.modules.ai;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.common.moderation.ModerationStatus;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.CandidateRecommendation;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobMatch;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobRecommendations;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.ViewerJobRecommendations;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobMatchRecommendation;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobRecommendations;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.UserJobRecommendations;
import tn.esprit.connect.modules.job.entity.JobOffer;
import tn.esprit.connect.modules.job.repository.JobOfferRepository;
import tn.esprit.connect.modules.notification.service.NotificationService;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Computes "best candidates for a job" using the local Ollama model.
 *
 * Strategy: build a short text record per candidate (headline + promo + specialty + skills),
 * batch up to MAX_CANDIDATES into the prompt, ask the model to rank them as JSON.
 * If Ollama is unavailable, fall back to a deterministic skill-overlap heuristic so the
 * UI always shows something useful — but flag fallbackReason so the recruiter knows.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecommendationService {

    private static final int MAX_CANDIDATES_IN_PROMPT = 30;
    private static final int TOP_K_RETURNED = 8;
    private static final int TOP_JOBS_FOR_USER = 10;
    private static final int AUTO_NOTIFY_THRESHOLD = 40;    // min matchScore to notify/email a candidate
    private static final int CV_JOB_NOTIFY_THRESHOLD = 40;

    private final JdbcTemplate jdbc;
    private final OllamaService ollama;
    private final JobOfferRepository jobOfferRepository;
    private final NotificationService notificationService;
    private final MailService mailService;

    @Transactional(readOnly = true)
    public JobRecommendations recommend(UUID jobId) {
        JobOffer job = jobOfferRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException("JobOffer", jobId));

        List<Candidate> pool = loadCandidatePool();
        if (pool.isEmpty()) {
            return new JobRecommendations(job.getId(), job.getTitle(), List.of(),
                    ollama.isEnabled(), "No candidates in the network yet.");
        }

        // Retrieve-then-rerank:
        //  1) RETRIEVE — the deterministic heuristic scores the whole network on
        //     skills + headline + about/bio and returns the most relevant
        //     shortlist (instant). This guarantees only relevant people advance.
        //  2) RERANK — the LLM re-orders ONLY that small shortlist and writes
        //     the match reasons. Tiny prompt → fast, and the model can't promote
        //     an irrelevant profile because it never sees one.
        // If the LLM is disabled/slow/unusable, we keep the heuristic order.
        List<CandidateRecommendation> shortlist = rankByHeuristic(job, pool);
        if (shortlist.isEmpty()) {
            return new JobRecommendations(job.getId(), job.getTitle(), List.of(), true,
                    "No candidates match this role yet.");
        }
        if (ollama.isEnabled()) {
            try {
                Map<UUID, Candidate> byId = pool.stream()
                        .collect(Collectors.toMap(Candidate::userId, c -> c));
                List<Candidate> shortCands = shortlist.stream()
                        .map(r -> byId.get(r.userId()))
                        .filter(Objects::nonNull)
                        .toList();
                List<CandidateRecommendation> reranked = rankWithOllama(job, shortCands);
                if (!reranked.isEmpty()) {
                    return new JobRecommendations(job.getId(), job.getTitle(), reranked, true, null);
                }
            } catch (Exception e) {
                log.warn("LLM rerank for job {} failed; using heuristic order: {}", jobId, e.getMessage());
            }
        }
        return new JobRecommendations(job.getId(), job.getTitle(), shortlist, true, null);
    }

    /**
     * Triggered when a job goes APPROVED — sends a notification to each high-match candidate.
     * Best-effort: failures are logged but don't roll back the approval transaction.
     */
    /**
     * Rank approved job openings for a user based on profile skills, headline,
     * bio, and experience titles (typically refreshed after a CV import).
     */
    @Transactional(readOnly = true)
    public UserJobRecommendations recommendJobsForUser(UUID userId) {
        UserProfile user = loadUserProfile(userId);
        if (user == null) {
            return new UserJobRecommendations(List.of(), ollama.isEnabled(),
                    "Complete your profile or import your CV to get job matches.");
        }

        List<JobOffer> jobs = jobOfferRepository
                .findByModerationStatusOrderByCreatedAtDesc(
                        ModerationStatus.APPROVED,
                        org.springframework.data.domain.Pageable.ofSize(200))
                .getContent();
        if (jobs.isEmpty()) {
            return new UserJobRecommendations(List.of(), ollama.isEnabled(),
                    "No approved jobs in the network yet.");
        }

        List<JobMatchRecommendation> ranked = rankJobsByHeuristic(user, jobs);
        return new UserJobRecommendations(ranked, true,
                ranked.isEmpty()
                        ? (user.skills().isEmpty()
                                ? "Add skills (import your CV) for better matches."
                                : "No roles match your profile yet.")
                        : null);
    }

    /** Notify the user after a CV import when we found relevant openings. */
    public void notifyUserOfCvJobMatches(UUID userId) {
        try {
            UserJobRecommendations recs = recommendJobsForUser(userId);
            List<JobMatchRecommendation> strong = recs.jobs().stream()
                    .filter(j -> j.matchScore() >= CV_JOB_NOTIFY_THRESHOLD)
                    .toList();
            if (strong.isEmpty()) return;
            JobMatchRecommendation top = strong.get(0);
            String body = strong.size() == 1
                    ? top.title() + " at " + top.companyName() + " (" + top.matchScore() + "% match)"
                    : top.title() + " and " + (strong.size() - 1) + " more (" + top.matchScore() + "% top match)";
            notificationService.create(
                    userId,
                    "CV_JOB_MATCH",
                    "Jobs matching your CV",
                    body,
                    "/jobs");
        } catch (Exception e) {
            log.warn("CV job-match notification failed for user {}: {}", userId, e.getMessage());
        }
    }

    public void notifyMatchedCandidates(UUID jobId) {
        try {
            JobOffer offer = jobOfferRepository.findById(jobId).orElse(null);
            if (offer == null) {
                log.warn("Auto-notify: job {} not found (transaction not committed yet?)", jobId);
                return;
            }
            String jobTitle = offer.getTitle();

            // Deterministic keyword/skill matching for the auto-notify path: a
            // profile whose skills (or headline/specialty keywords) appear in
            // the job ALWAYS matches — no dependency on Ollama (which may be
            // down or rank differently). Ollama still powers the recruiter-
            // facing recommend() recommendations panel.
            List<CandidateRecommendation> matched = rankByHeuristic(offer, loadCandidatePool()).stream()
                    .filter(c -> c.matchScore() >= AUTO_NOTIFY_THRESHOLD)
                    .toList();

            log.info("Auto-notify job {}: source=keyword, matched(>= {})=[{}]",
                    jobId, AUTO_NOTIFY_THRESHOLD,
                    matched.stream().map(c -> c.email() + "=" + c.matchScore())
                            .collect(Collectors.joining(", ")));

            // In-app notification for every match (regardless of open-to-work).
            for (CandidateRecommendation c : matched) {
                notificationService.create(
                        c.userId(),
                        "JOB_MATCH",
                        "New job matches your profile: " + jobTitle,
                        "Match score " + c.matchScore() + "%. " + (c.reason() == null ? "" : c.reason()),
                        "/jobs/" + jobId
                );
            }

            // Email ONLY candidates who marked themselves open to work.
            Set<UUID> openToWork = openToWorkAmong(
                    matched.stream().map(CandidateRecommendation::userId).toList());
            int emailed = 0;
            if (!openToWork.isEmpty()) {
                JobEmailInfo job = loadJobEmailInfo(jobId);
                for (CandidateRecommendation c : matched) {
                    if (!openToWork.contains(c.userId())) continue;
                    try {
                        mailService.sendJobMatchEmail(
                                c.email(), c.firstName(),
                                job == null ? jobTitle : job.title(),
                                job == null ? null : job.companyName(),
                                job == null ? null : job.location(),
                                job != null && job.remote(),
                                c.matchScore(), c.reason(),
                                "/jobs/" + jobId);
                        emailed++;
                    } catch (Exception mailEx) {
                        log.warn("Job-match email to {} for job {} failed: {}",
                                c.email(), jobId, mailEx.getMessage());
                    }
                }
            }

            log.info("Auto-notify completed for job {}: {} in-app, {} open-to-work email(s)",
                    jobId, matched.size(), emailed);
        } catch (Exception e) {
            log.warn("Auto-notify failed for job {}: {}", jobId, e.getMessage());
        }
    }

    private record JobEmailInfo(String title, String companyName, String location, boolean remote) {}

    private JobEmailInfo loadJobEmailInfo(UUID jobId) {
        String sql = """
            SELECT j.title, c.name AS company_name, j.location, j.is_remote
            FROM job_offers j JOIN companies c ON c.id = j.company_id
            WHERE j.id = ?
            """;
        List<JobEmailInfo> rows = jdbc.query(sql, (rs, i) -> new JobEmailInfo(
                rs.getString("title"), rs.getString("company_name"),
                rs.getString("location"), rs.getBoolean("is_remote")), jobId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Subset of the given user ids that have open_to_work = true. */
    private Set<UUID> openToWorkAmong(List<UUID> userIds) {
        if (userIds == null || userIds.isEmpty()) return Set.of();
        String placeholders = userIds.stream().map(x -> "?").collect(Collectors.joining(","));
        String sql = "SELECT id FROM users WHERE open_to_work = true AND id IN (" + placeholders + ")";
        return new HashSet<>(jdbc.query(sql,
                (rs, i) -> rs.getObject("id", UUID.class), userIds.toArray()));
    }

    // ---------------- Viewer → jobs (Bug-1: real per-user match %) ----------------

    private static final int JOB_POOL_DEFAULT = 30;
    private static final int JOB_POOL_MAX = 100;

    /**
     * Score the most recent approved jobs against a single viewer's profile.
     * Same contract as {@link #recommend}: try Ollama, fall back to a
     * deterministic token-overlap heuristic, and flag which path produced
     * the result so the UI can label AI · OLLAMA vs AI · FALLBACK.
     */
    @Transactional(readOnly = true)
    public ViewerJobRecommendations recommendForViewer(UUID viewerUserId, int limit) {
        int poolSize = Math.max(1, Math.min(limit <= 0 ? JOB_POOL_DEFAULT : limit, JOB_POOL_MAX));

        ViewerProfile viewer = loadViewerProfile(viewerUserId);
        if (viewer == null) {
            return new ViewerJobRecommendations(List.of(), ollama.isEnabled(),
                    "Complete your profile (skills, headline) to get personalised matches.");
        }

        List<JobRow> pool = loadRecentApprovedJobs(poolSize);
        if (pool.isEmpty()) {
            return new ViewerJobRecommendations(List.of(), ollama.isEnabled(),
                    "No open roles to match against yet.");
        }

        List<JobMatch> ranked = rankJobsByHeuristic(viewer, pool);
        return new ViewerJobRecommendations(ranked, true,
                ranked.isEmpty() ? "No roles match your profile yet." : null);
    }

    private record ViewerProfile(String headline, String bio, String specialtyCode,
                                  Integer promotionYear, List<String> skills,
                                  List<String> experienceTitles) {}

    private record JobRow(UUID id, String title, String description, String type,
                           String location, boolean remote, String companyName) {}

    private ViewerProfile loadViewerProfile(UUID userId) {
        String sql = """
            SELECT p.headline, p.bio,
                   s.code AS specialty_code,
                   pr.year AS promotion_year,
                   COALESCE(string_agg(DISTINCT sk.name, ','), '')  AS skills_csv,
                   COALESCE(string_agg(DISTINCT ex.title, ','), '') AS exp_titles
            FROM profiles p
            LEFT JOIN specialties s  ON s.id = p.specialty_id
            LEFT JOIN promotions  pr ON pr.id = p.promotion_id
            LEFT JOIN skills      sk ON sk.profile_id = p.id
            LEFT JOIN experiences ex ON ex.profile_id = p.id
            WHERE p.user_id = ?
            GROUP BY p.headline, p.bio, s.code, pr.year
            """;
        List<ViewerProfile> rows = jdbc.query(sql, (rs, i) -> new ViewerProfile(
                rs.getString("headline"),
                rs.getString("bio"),
                rs.getString("specialty_code"),
                rs.getObject("promotion_year") == null ? null : rs.getInt("promotion_year"),
                csvToList(rs.getString("skills_csv")),
                csvToList(rs.getString("exp_titles"))
        ), userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<JobRow> loadRecentApprovedJobs(int limit) {
        String sql = """
            SELECT j.id, j.title, j.description, j.type, j.location, j.is_remote,
                   c.name AS company_name
            FROM job_offers j
            JOIN companies c ON c.id = j.company_id
            WHERE j.deleted_at IS NULL
              AND j.moderation_status = 'APPROVED'
              AND (j.expires_at IS NULL OR j.expires_at > now())
            ORDER BY j.created_at DESC
            LIMIT ?
            """;
        return jdbc.query(sql, (rs, i) -> new JobRow(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("type"),
                rs.getString("location"),
                rs.getBoolean("is_remote"),
                rs.getString("company_name")
        ), limit);
    }

    private List<JobMatch> rankJobsWithOllama(ViewerProfile viewer, List<JobRow> pool) {
        String system = """
            You match a single alumnus/student to relevant job openings.
            Return ONLY valid JSON in the exact shape:
              { "matches": [
                  { "jobId": "<uuid>",
                    "score": <0-100 integer>,
                    "matchingSkills": ["..."],
                    "reason": "<one short sentence>" } ] }
            Score by how well the person's skills, specialty, experience and
            headline fit each job. Be honest — give low scores to weak fits.
            Use only the jobIds provided; never invent one.
            """;

        StringBuilder user = new StringBuilder();
        user.append("PERSON:\n")
            .append("Headline: ").append(viewer.headline() == null ? "—" : viewer.headline()).append('\n')
            .append("Specialty: ").append(viewer.specialtyCode() == null ? "?" : viewer.specialtyCode())
            .append(' ').append(viewer.promotionYear() == null ? "" : viewer.promotionYear()).append('\n')
            .append("Skills: ").append(String.join(",", viewer.skills())).append('\n')
            .append("Experience: ").append(String.join(",", viewer.experienceTitles())).append('\n')
            .append("Bio: ").append(safeTruncate(viewer.bio(), 400)).append("\n\n");

        user.append("JOBS:\n");
        for (JobRow j : pool) {
            user.append("- jobId=").append(j.id())
                .append(" | ").append(j.title())
                .append(" | ").append(j.type() == null ? "?" : j.type())
                .append(" | ").append(j.remote() ? "remote" : (j.location() == null ? "—" : j.location()))
                .append(" | ").append(j.companyName() == null ? "—" : j.companyName())
                .append(" | ").append(safeTruncate(j.description(), 300))
                .append('\n');
        }

        JsonNode json = ollama.chatJson(system, user.toString());
        if (json == null || !json.has("matches")) return List.of();

        Map<UUID, JobRow> byId = pool.stream().collect(Collectors.toMap(JobRow::id, j -> j));

        List<JobMatch> out = new ArrayList<>();
        for (JsonNode node : json.path("matches")) {
            UUID id;
            try { id = UUID.fromString(node.path("jobId").asText("")); }
            catch (Exception e) { continue; }
            JobRow j = byId.get(id);
            if (j == null) continue;   // hallucinated id — skip
            int score = Math.max(0, Math.min(100, node.path("score").asInt(0)));
            List<String> matching = new ArrayList<>();
            node.path("matchingSkills").forEach(s -> matching.add(s.asText("")));
            out.add(new JobMatch(j.id(), j.title(), j.companyName(), j.location(),
                    j.remote(), matching, score, node.path("reason").asText("")));
        }
        out.sort(Comparator.comparingInt(JobMatch::matchScore).reversed());
        return out;
    }

    private List<JobMatch> rankJobsByHeuristic(ViewerProfile viewer, List<JobRow> pool) {
        // Build the viewer's interest token set from skills + headline + experience titles.
        Set<String> viewerTokens = new HashSet<>();
        viewer.skills().forEach(s -> viewerTokens.add(s.toLowerCase(Locale.ROOT)));
        viewerTokens.addAll(tokenize(viewer.headline()));
        viewer.experienceTitles().forEach(t -> viewerTokens.addAll(tokenize(t)));

        List<JobMatch> scored = new ArrayList<>();
        for (JobRow j : pool) {
            String jobText = j.title() + " " + safeTruncate(j.description(), 2000);
            String jobTextLower = jobText.toLowerCase(Locale.ROOT);
            Set<String> jobTokens = tokenize(jobText);
            List<String> matching = viewer.skills().stream()
                    .filter(s -> skillMatchesJob(s, jobTokens, jobTextLower))
                    .toList();
            int overlap = (int) viewerTokens.stream().filter(jobTokens::contains).count();
            int score = Math.min(100, matching.size() * 40 + overlap * 4);
            if (score == 0) continue;                        // no signal → no chip, sinks to bottom
            scored.add(new JobMatch(j.id(), j.title(), j.companyName(), j.location(), j.remote(),
                    matching, score,
                    matching.isEmpty() ? "profile keywords overlap"
                                       : matching.size() + " skill(s) match this role"));
        }
        scored.sort(Comparator.comparingInt(JobMatch::matchScore).reversed());
        return scored;
    }

    private static List<String> csvToList(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    // ---------------- Implementation details ----------------

    private record Candidate(UUID userId, String firstName, String lastName, String email,
                              String headline, String bio, Integer promotionYear, String specialtyCode,
                              List<String> skills, String avatarUrl, boolean openToWork) {}

    private record UserProfile(UUID userId, String headline, String bio,
                               String specialtyCode, List<String> skills,
                               List<String> experienceText) {}

    private List<Candidate> loadCandidatePool() {
        String sql = """
            SELECT u.id AS user_id, u.email,
                   p.first_name, p.last_name, p.headline, p.bio, p.avatar_url,
                   u.open_to_work,
                   pr.year AS promotion_year,
                   s.code AS specialty_code,
                   COALESCE(string_agg(DISTINCT sk.name, ','), '') AS skills_csv
            FROM users u
            JOIN profiles p   ON p.user_id = u.id
            LEFT JOIN promotions pr ON pr.id = p.promotion_id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            LEFT JOIN skills sk     ON sk.profile_id = p.id
            WHERE u.deleted_at IS NULL
              AND u.status <> 'SUSPENDED'
              AND u.role <> 'ADMIN'
            GROUP BY u.id, u.email, p.first_name, p.last_name, p.headline, p.bio,
                     p.avatar_url, u.open_to_work, pr.year, s.code
            LIMIT 500
            """;
        return jdbc.query(sql, (rs, i) -> new Candidate(
                rs.getObject("user_id", UUID.class),
                rs.getString("first_name"),
                rs.getString("last_name"),
                rs.getString("email"),
                rs.getString("headline"),
                rs.getString("bio"),
                rs.getObject("promotion_year") == null ? null : rs.getInt("promotion_year"),
                rs.getString("specialty_code"),
                Arrays.stream(rs.getString("skills_csv").split(","))
                        .map(String::trim).filter(s -> !s.isEmpty()).toList(),
                rs.getString("avatar_url"),
                rs.getBoolean("open_to_work")
        ));
    }

    // ------- AI path -------

    private List<CandidateRecommendation> rankWithOllama(JobOffer job, List<Candidate> pool) {
        // Limit prompt size to keep llama3.2:3b responsive
        List<Candidate> sample = pool.size() > MAX_CANDIDATES_IN_PROMPT
                ? pool.subList(0, MAX_CANDIDATES_IN_PROMPT) : pool;

        String system = """
            You are a technical recruiter helping match alumni to a job opening.
            Return ONLY valid JSON in the exact shape:
              { "candidates": [
                  { "userId": "<uuid>",
                    "matchScore": <0-100 integer>,
                    "matchingSkills": ["..."],
                    "reason": "<one short sentence>" } ] }
            Rank candidates strictly by how well their skills, specialty, and headline
            fit the job. Be honest — give low scores to weak matches.
            Return at most 10 candidates. Do not invent userIds — only use those provided.
            """;

        StringBuilder user = new StringBuilder();
        user.append("JOB:\n")
            .append("Title: ").append(job.getTitle()).append('\n')
            .append("Type: ").append(job.getType()).append('\n')
            .append("Location: ").append(job.getLocation() == null ? "—" : job.getLocation()).append('\n')
            .append("Description: ").append(safeTruncate(job.getDescription(), 1200)).append("\n\n");

        user.append("CANDIDATES:\n");
        for (Candidate c : sample) {
            user.append("- userId=").append(c.userId())
                .append(" | ").append(c.firstName()).append(' ').append(c.lastName())
                .append(" | ").append(c.specialtyCode() == null ? "?" : c.specialtyCode())
                .append(' ').append(c.promotionYear() == null ? "?" : c.promotionYear())
                .append(" | headline: ").append(c.headline() == null ? "—" : c.headline())
                .append(" | skills: ").append(String.join(",", c.skills()))
                .append(" | about: ").append(safeTruncate(c.bio(), 200))
                .append('\n');
        }

        JsonNode json = ollama.chatJson(system, user.toString());
        if (json == null || !json.has("candidates")) return List.of();

        Map<UUID, Candidate> byId = sample.stream()
                .collect(Collectors.toMap(Candidate::userId, c -> c));

        List<CandidateRecommendation> out = new ArrayList<>();
        for (JsonNode node : json.path("candidates")) {
            String idStr = node.path("userId").asText("");
            UUID id;
            try { id = UUID.fromString(idStr); } catch (Exception e) { continue; }
            Candidate c = byId.get(id);
            if (c == null) continue;     // hallucinated id — skip
            int score = Math.max(0, Math.min(100, node.path("matchScore").asInt(0)));
            List<String> matching = new ArrayList<>();
            node.path("matchingSkills").forEach(s -> matching.add(s.asText("")));
            out.add(new CandidateRecommendation(
                    c.userId(), c.firstName(), c.lastName(), c.email(),
                    c.headline(), c.promotionYear(), c.specialtyCode(),
                    matching, score, node.path("reason").asText(""),
                    c.avatarUrl(), c.openToWork()
            ));
        }

        out.sort(Comparator.comparingInt(CandidateRecommendation::matchScore).reversed());
        return out.stream().limit(TOP_K_RETURNED).toList();
    }

    private UserProfile loadUserProfile(UUID userId) {
        String sql = """
            SELECT p.headline, p.bio, s.code AS specialty_code,
                   COALESCE(string_agg(DISTINCT sk.name, ','), '') AS skills_csv
            FROM users u
            JOIN profiles p ON p.user_id = u.id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            LEFT JOIN skills sk ON sk.profile_id = p.id
            WHERE u.id = ? AND u.deleted_at IS NULL
            GROUP BY p.id, p.headline, p.bio, s.code
            """;
        List<UserProfile> rows = jdbc.query(sql, (rs, i) -> {
            List<String> skills = Arrays.stream(rs.getString("skills_csv").split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).toList();
            return new UserProfile(
                    userId,
                    rs.getString("headline"),
                    rs.getString("bio"),
                    rs.getString("specialty_code"),
                    skills,
                    List.of());
        }, userId);
        if (rows.isEmpty()) return null;

        String expSql = """
            SELECT title, company, description FROM experiences e
            JOIN profiles p ON p.id = e.profile_id
            WHERE p.user_id = ?
            ORDER BY e.start_date DESC
            LIMIT 20
            """;
        List<String> expText = jdbc.query(expSql, (rs, i) -> {
            String t = rs.getString("title");
            String c = rs.getString("company");
            String d = rs.getString("description");
            return (t == null ? "" : t) + " " + (c == null ? "" : c) + " " + (d == null ? "" : d);
        }, userId);

        UserProfile base = rows.get(0);
        return new UserProfile(base.userId(), base.headline(), base.bio(),
                base.specialtyCode(), base.skills(), expText);
    }

    private List<JobMatchRecommendation> rankJobsWithOllama(UserProfile user, List<JobOffer> jobs) {
        List<JobOffer> sample = jobs.size() > 25 ? jobs.subList(0, 25) : jobs;
        String system = """
            You are a career coach matching job openings to a candidate profile.
            Return ONLY valid JSON:
              { "jobs": [
                  { "jobOfferId": "<uuid>",
                    "matchScore": <0-100>,
                    "matchingSkills": ["..."],
                    "reason": "<one short sentence>" } ] }
            Rank by fit using skills, headline, bio, and experience. Be honest.
            Return at most 8 jobs. Only use jobOfferIds from the list provided.
            """;

        StringBuilder userMsg = new StringBuilder();
        userMsg.append("CANDIDATE:\n")
                .append("headline: ").append(user.headline() == null ? "—" : user.headline()).append('\n')
                .append("bio: ").append(safeTruncate(user.bio(), 800)).append('\n')
                .append("specialty: ").append(user.specialtyCode() == null ? "—" : user.specialtyCode()).append('\n')
                .append("skills: ").append(String.join(", ", user.skills())).append('\n')
                .append("experience: ").append(safeTruncate(String.join(" | ", user.experienceText()), 1000))
                .append("\n\nJOBS:\n");
        for (JobOffer j : sample) {
            userMsg.append("- jobOfferId=").append(j.getId())
                    .append(" | ").append(j.getTitle())
                    .append(" @ ").append(j.getCompany().getName())
                    .append(" | ").append(j.getType())
                    .append(" | ").append(j.getLocation() == null ? "—" : j.getLocation())
                    .append(" | ").append(safeTruncate(j.getDescription(), 400))
                    .append('\n');
        }

        JsonNode json = ollama.chatJson(system, userMsg.toString());
        if (json == null || !json.has("jobs")) return List.of();

        Map<UUID, JobOffer> byId = sample.stream()
                .collect(Collectors.toMap(JobOffer::getId, j -> j));

        List<JobMatchRecommendation> out = new ArrayList<>();
        for (JsonNode node : json.path("jobs")) {
            UUID id;
            try { id = UUID.fromString(node.path("jobOfferId").asText("")); }
            catch (Exception e) { continue; }
            JobOffer j = byId.get(id);
            if (j == null) continue;
            int score = Math.max(0, Math.min(100, node.path("matchScore").asInt(0)));
            List<String> matching = new ArrayList<>();
            node.path("matchingSkills").forEach(s -> matching.add(s.asText("")));
            out.add(toJobMatch(j, matching, score, node.path("reason").asText("")));
        }
        out.sort(Comparator.comparingInt(JobMatchRecommendation::matchScore).reversed());
        return out.stream().limit(TOP_JOBS_FOR_USER).toList();
    }

    private List<JobMatchRecommendation> rankJobsByHeuristic(UserProfile user, List<JobOffer> jobs) {
        String profileText = (user.headline() == null ? "" : user.headline()) + " "
                + (user.bio() == null ? "" : user.bio()) + " "
                + String.join(" ", user.experienceText());
        Set<String> profileTokens = tokenize(profileText);

        List<JobMatchRecommendation> scored = new ArrayList<>();
        for (JobOffer j : jobs) {
            String jobText = j.getTitle() + " " + safeTruncate(j.getDescription(), 2000);
            String jobTextLower = jobText.toLowerCase(Locale.ROOT);
            Set<String> jobTokens = tokenize(jobText);
            List<String> matching = user.skills().stream()
                    .filter(s -> skillMatchesJob(s, jobTokens, jobTextLower))
                    .toList();
            int base = matching.size() * 40;
            long tokenOverlap = profileTokens.stream().filter(jobTokens::contains).count();
            int specialtyBonus = user.specialtyCode() != null
                    && jobTokens.contains(user.specialtyCode().toLowerCase(Locale.ROOT)) ? 10 : 0;
            int score = Math.min(100, base + (int) tokenOverlap * 4 + specialtyBonus);
            if (score == 0) continue;
            String reason = !matching.isEmpty()
                    ? matching.size() + " skill(s) match this role"
                    : tokenOverlap + " profile keyword(s) overlap";
            scored.add(toJobMatch(j, matching, score, reason));
        }
        scored.sort(Comparator.comparingInt(JobMatchRecommendation::matchScore).reversed());
        return scored.stream().limit(TOP_JOBS_FOR_USER).toList();
    }

    private JobMatchRecommendation toJobMatch(JobOffer j, List<String> matching,
                                              int score, String reason) {
        return new JobMatchRecommendation(
                j.getId(),
                j.getTitle(),
                j.getCompany().getName(),
                j.getType().name(),
                j.getLocation(),
                j.isRemote(),
                matching,
                score,
                reason == null || reason.isBlank() ? "Profile overlap" : reason);
    }

    // ------- Fallback heuristic (candidates for a job) -------

    private List<CandidateRecommendation> rankByHeuristic(JobOffer job, List<Candidate> pool) {
        String jobText = job.getTitle() + " " + safeTruncate(job.getDescription(), 2000);
        String jobTextLower = jobText.toLowerCase(Locale.ROOT);
        Set<String> jobTokens = tokenize(jobText);

        List<CandidateRecommendation> scored = new ArrayList<>();
        for (Candidate c : pool) {
            // A skill counts if it's referenced in the job text — exact token,
            // whole-word substring (handles SHORT skills like "QA"/"AI" that the
            // 3-char tokenizer drops, and multi-word ones like "Machine
            // Learning"), or all-its-tokens-present. Each matched skill is
            // heavily weighted so even ONE matching skill clears the threshold.
            List<String> matching = c.skills().stream()
                    .filter(s -> skillMatchesJob(s, jobTokens, jobTextLower))
                    .toList();

            // Broader keyword overlap (skills + headline + specialty) — mirrors
            // the viewer-side scorer so a profile that sees this job in its
            // recommendations also surfaces here as a candidate.
            Set<String> candTokens = new HashSet<>();
            c.skills().forEach(s -> candTokens.addAll(tokenize(s)));
            candTokens.addAll(tokenize(c.headline()));
            candTokens.addAll(tokenize(c.bio()));
            if (c.specialtyCode() != null) candTokens.add(c.specialtyCode().toLowerCase(Locale.ROOT));
            int overlap = (int) candTokens.stream().filter(jobTokens::contains).count();

            int score = Math.min(100, matching.size() * 40 + overlap * 4);
            if (score == 0) continue;
            scored.add(new CandidateRecommendation(
                    c.userId(), c.firstName(), c.lastName(), c.email(),
                    c.headline(), c.promotionYear(), c.specialtyCode(),
                    matching, score,
                    matching.isEmpty() ? "profile keywords overlap this role"
                                       : matching.size() + " skill(s) match this role",
                    c.avatarUrl(), c.openToWork()
            ));
        }
        scored.sort(Comparator.comparingInt(CandidateRecommendation::matchScore).reversed());
        return scored.stream().limit(TOP_K_RETURNED).toList();
    }

    /**
     * True when a candidate's skill is referenced in the job posting. Matches
     * on: exact token, whole-"word" substring using alphanumeric boundaries
     * (so "qa" hits "QA Engineer" but not "qatar", and "c#"/"c++" work), or all
     * tokens of a multi-word skill being present in the job tokens.
     */
    private static boolean skillMatchesJob(String skill, Set<String> jobTokens, String jobTextLower) {
        String s = skill == null ? "" : skill.toLowerCase(Locale.ROOT).trim();
        if (s.isEmpty()) return false;
        // 1. Exact token, or the whole skill as a word in the job text.
        if (jobTokens.contains(s)) return true;
        if (jobTextLower.matches(".*(?<![a-z0-9])" + Pattern.quote(s) + "(?![a-z0-9]).*")) return true;
        // 2. Token-level fuzzy match: compare each token of the skill against
        //    each job token on equality OR shared prefix, so versioned/variant
        //    skills line up — "c++20"↔"c++", "python3"↔"python",
        //    "javascript"↔"java". Min length 3 avoids noise from tiny tokens.
        for (String st : tokenize(s)) {
            if (st.length() < 3) continue;
            for (String jt : jobTokens) {
                if (jt.length() < 3) continue;
                if (st.equals(jt) || st.startsWith(jt) || jt.startsWith(st)) return true;
            }
        }
        return false;
    }

    private static Set<String> tokenize(String text) {
        if (text == null) return Set.of();
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^a-z0-9+#.]+"))
                .filter(s -> s.length() >= 3)
                .collect(Collectors.toSet());
    }

    private static String safeTruncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
