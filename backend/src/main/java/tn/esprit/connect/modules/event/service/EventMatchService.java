package tn.esprit.connect.modules.event.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tn.esprit.connect.modules.ai.OllamaService;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.modules.event.entity.Event;
import tn.esprit.connect.modules.event.entity.EventSpeaker;
import tn.esprit.connect.modules.event.repository.EventRepository;
import tn.esprit.connect.modules.event.repository.EventSpeakerRepository;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Feature-1: when an event is approved, find the profiles it's a good
 * semantic fit for and email them "this event might be for you".
 *
 * There is no stored "interests" field — a person's interests are inferred
 * from the signals we DO have: their skills, headline, bio, and their
 * activity (posts they wrote, posts they reposted, and posts they reacted
 * to). We hand that blob to Ollama and ask it to rank fit against the event
 * (title + description + speakers). Same graceful-fallback contract as
 * {@link tn.esprit.connect.modules.ai.RecommendationService}: if Ollama is
 * down we fall back to a deterministic token-overlap heuristic.
 *
 * Called from a {@code CompletableFuture.runAsync} on the approval path, so
 * everything here is best-effort and self-contained — failures are logged,
 * never thrown, and never roll back the approval transaction.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EventMatchService {

    private static final int CANDIDATE_POOL_LIMIT = 300;
    private static final int MAX_CANDIDATES_IN_PROMPT = 30;   // keep llama3.2:3b responsive
    private static final int MAX_MATCHES = 15;
    private static final int MIN_EVENT_MATCH_SCORE = 25;
    private static final int ACTIVITY_MAX_CHARS = 800;

    private final JdbcTemplate jdbc;
    private final OllamaService ollama;
    private final MailService mailService;
    private final EventRepository eventRepository;
    private final EventSpeakerRepository speakerRepository;

    /** Rank candidates against the event and email the strong matches. */
    public void matchAndEmail(UUID eventId) {
        EventInfo event = loadEvent(eventId);
        if (event == null) {
            log.warn("Event match: event {} not found", eventId);
            return;
        }

        List<Candidate> pool = loadCandidatePool();
        if (pool.isEmpty()) {
            log.info("Event match for {}: no eligible candidates", eventId);
            return;
        }

        // Deterministic interest matching (skills + headline + bio + activity).
        // Reliable and fast; the small local model ranks events poorly. Score
        // everyone first (minScore 0) so we can log WHY people did/didn't match.
        List<EventMatch> scored = rankByHeuristic(eventText(event), pool, 0, Integer.MAX_VALUE);
        log.info("Event match {}: pool={}, top=[{}]", eventId, pool.size(),
                scored.stream().limit(6).map(m -> m.email() + "=" + m.score())
                        .collect(Collectors.joining(", ")));

        List<EventMatch> matches = scored.stream()
                .filter(m -> m.score() >= MIN_EVENT_MATCH_SCORE)
                .limit(MAX_MATCHES)
                .toList();

        int sent = 0;
        for (EventMatch m : matches) {
            if (m.email() == null || m.email().isBlank()) continue;   // defensive
            try {
                mailService.sendEventMatchEmail(
                        m.email(), m.firstName(),
                        event.title(), event.startAt(), event.location(),
                        m.reason(), "/events");
                sent++;
            } catch (Exception e) {
                log.warn("Event match email to {} failed: {}", m.email(), e.getMessage());
            }
        }
        log.info("Event match for {}: {} matched / {} emailed (threshold {})",
                eventId, matches.size(), sent, MIN_EVENT_MATCH_SCORE);
    }

    // ── Event side (repositories — eager scalars are safe outside a tx) ────────

    record EventInfo(String title, String description, String location,
                     Instant startAt, String speakersText) {}

    private EventInfo loadEvent(UUID eventId) {
        Optional<Event> opt = eventRepository.findById(eventId);
        if (opt.isEmpty()) return null;
        Event e = opt.get();
        StringBuilder speakers = new StringBuilder();
        for (EventSpeaker s : speakerRepository.findByEventIdOrderBySortOrderAsc(eventId)) {
            speakers.append(s.getName() == null ? "" : s.getName()).append(' ')
                    .append(s.getRole() == null ? "" : s.getRole()).append(' ')
                    .append(s.getCompany() == null ? "" : s.getCompany()).append(' ')
                    .append(safeTruncate(s.getBio(), 200)).append(" | ");
        }
        return new EventInfo(e.getTitle(), e.getDescription(), e.getLocation(),
                e.getStartAt(), speakers.toString());
    }

    private static String eventText(EventInfo e) {
        return (e.title() == null ? "" : e.title()) + " "
                + (e.description() == null ? "" : e.description()) + " "
                + (e.speakersText() == null ? "" : e.speakersText());
    }

    // ── Candidate side (activity-driven "interests") ──────────────────────────

    record Candidate(UUID userId, String email, String firstName, String lastName,
                     String headline, String bio, String specialtyCode,
                     List<String> skills, String interests) {}

    private List<Candidate> loadCandidatePool() {
        // Base profile data for active, searchable members.
        String baseSql = """
            SELECT u.id AS user_id, u.email,
                   p.first_name, p.last_name, p.headline, p.bio,
                   s.code AS specialty_code,
                   COALESCE(string_agg(DISTINCT sk.name, ','), '') AS skills_csv
            FROM users u
            JOIN profiles p   ON p.user_id = u.id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            LEFT JOIN skills sk     ON sk.profile_id = p.id
            WHERE u.deleted_at IS NULL
              AND u.status <> 'SUSPENDED'
              AND u.role <> 'ADMIN'
            GROUP BY u.id, u.email, p.first_name, p.last_name, p.headline, p.bio, s.code
            LIMIT ?
            """;

        // Interests signal: text from posts the user wrote, reposted (the
        // original's content), or reacted to — over the last 180 days.
        Map<UUID, String> activity = loadActivity();

        return jdbc.query(baseSql, (rs, i) -> {
            UUID userId = rs.getObject("user_id", UUID.class);
            List<String> skills = Arrays.stream(rs.getString("skills_csv").split(","))
                    .map(String::trim).filter(s -> !s.isEmpty()).toList();
            return new Candidate(
                    userId, rs.getString("email"),
                    rs.getString("first_name"), rs.getString("last_name"),
                    rs.getString("headline"), rs.getString("bio"),
                    rs.getString("specialty_code"), skills,
                    safeTruncate(activity.getOrDefault(userId, ""), ACTIVITY_MAX_CHARS));
        }, CANDIDATE_POOL_LIMIT);
    }

    /** Aggregate recent activity text per user, used to infer interests. */
    private Map<UUID, String> loadActivity() {
        String sql = """
            SELECT act.user_id, string_agg(act.snippet, ' | ') AS activity
            FROM (
                SELECT p.author_id AS user_id, left(p.content, 200) AS snippet
                FROM posts p
                WHERE p.deleted_at IS NULL AND p.content IS NOT NULL AND p.content <> ''
                  AND p.created_at > now() - interval '180 days'
                UNION ALL
                SELECT rp.author_id AS user_id, left(op.content, 200) AS snippet
                FROM posts rp
                JOIN posts op ON op.id = rp.original_post_id
                WHERE rp.deleted_at IS NULL AND op.content IS NOT NULL AND op.content <> ''
                  AND rp.created_at > now() - interval '180 days'
                UNION ALL
                SELECT r.user_id AS user_id, left(p.content, 200) AS snippet
                FROM reactions r
                JOIN posts p ON p.id = r.post_id
                WHERE p.deleted_at IS NULL AND p.content IS NOT NULL AND p.content <> ''
                  AND r.created_at > now() - interval '180 days'
            ) act
            GROUP BY act.user_id
            """;
        Map<UUID, String> out = new HashMap<>();
        jdbc.query(sql, rs -> {
            out.put(rs.getObject("user_id", UUID.class), rs.getString("activity"));
        });
        return out;
    }

    // ── AI path ───────────────────────────────────────────────────────────────

    private List<EventMatch> rankWithOllama(EventInfo event, List<Candidate> pool) {
        List<Candidate> sample = pool.size() > MAX_CANDIDATES_IN_PROMPT
                ? pool.subList(0, MAX_CANDIDATES_IN_PROMPT) : pool;

        String system = """
            You match alumni and students to an event they'd want to attend.
            A person's interests are inferred from their skills, headline, bio,
            and their activity (posts they wrote, reposted, or reacted to).
            Return ONLY valid JSON in the exact shape:
              { "matches": [
                  { "userId": "<uuid>",
                    "score": <0-100 integer>,
                    "reason": "<one short second-person sentence, e.g. 'Because you post about ML and this event covers ML systems design'>" } ] }
            Only include genuine fits and return at most 15 people.
            Do not invent userIds — only use those provided.
            """;

        StringBuilder user = new StringBuilder();
        user.append("EVENT:\n")
            .append("Title: ").append(event.title()).append('\n')
            .append("Location: ").append(event.location() == null ? "—" : event.location()).append('\n')
            .append("Description: ").append(safeTruncate(event.description(), 1200)).append('\n')
            .append("Speakers/topics: ").append(safeTruncate(event.speakersText(), 600)).append("\n\n");

        user.append("PEOPLE:\n");
        for (Candidate c : sample) {
            user.append("- userId=").append(c.userId())
                .append(" | ").append(c.firstName()).append(' ').append(c.lastName())
                .append(" | ").append(c.specialtyCode() == null ? "?" : c.specialtyCode())
                .append(" | headline: ").append(c.headline() == null ? "—" : c.headline())
                .append(" | skills: ").append(String.join(",", c.skills()))
                .append(" | interests: ").append(safeTruncate(c.interests(), 400))
                .append('\n');
        }

        JsonNode json = ollama.chatJson(system, user.toString());
        if (json == null || !json.has("matches")) return List.of();

        Map<UUID, Candidate> byId = sample.stream()
                .collect(Collectors.toMap(Candidate::userId, c -> c));

        List<EventMatch> out = new ArrayList<>();
        for (JsonNode node : json.path("matches")) {
            UUID id;
            try { id = UUID.fromString(node.path("userId").asText("")); }
            catch (Exception e) { continue; }
            Candidate c = byId.get(id);
            if (c == null) continue;   // hallucinated id — skip
            int score = Math.max(0, Math.min(100, node.path("score").asInt(0)));
            out.add(new EventMatch(c.userId(), c.email(), c.firstName(), score,
                    node.path("reason").asText("")));
        }
        out.sort(Comparator.comparingInt(EventMatch::score).reversed());
        return out.stream().limit(MAX_MATCHES).toList();
    }

    // ── Fallback heuristic (pure — unit-tested without DB or Ollama) ───────────

    record EventMatch(UUID userId, String email, String firstName, int score, String reason) {}

    /**
     * Deterministic token-overlap match between the event text and each
     * candidate's inferred interests (skills + headline + bio + activity +
     * specialty). Pure and side-effect free so it can be tested directly.
     */
    static List<EventMatch> rankByHeuristic(String eventText, List<Candidate> pool,
                                            int minScore, int maxMatches) {
        Set<String> eventTokens = tokenize(eventText);
        List<EventMatch> scored = new ArrayList<>();
        for (Candidate c : pool) {
            Set<String> interestTokens = new HashSet<>();
            c.skills().forEach(s -> { interestTokens.add(s.toLowerCase(Locale.ROOT)); interestTokens.addAll(tokenize(s)); });
            interestTokens.addAll(tokenize(c.headline()));
            interestTokens.addAll(tokenize(c.bio()));
            interestTokens.addAll(tokenize(c.interests()));
            if (c.specialtyCode() != null) interestTokens.add(c.specialtyCode().toLowerCase(Locale.ROOT));

            // Prefix-aware skill match so versioned/variant skills line up
            // ("c++20" ↔ "c++", "python3" ↔ "python").
            List<String> matchedSkills = c.skills().stream()
                    .filter(s -> skillMatches(s, eventTokens))
                    .toList();
            int skillScore = matchedSkills.size() * 25;             // each matched skill = +25
            int overlap = (int) interestTokens.stream().filter(eventTokens::contains).count();
            int score = Math.min(100, skillScore + overlap * 6);
            if (score < minScore) continue;

            String reason = matchedSkills.isEmpty()
                    ? "Because your interests overlap with this event's topics."
                    : "Because your skills (" + String.join(", ",
                        matchedSkills.stream().limit(3).toList()) + ") match this event.";
            scored.add(new EventMatch(c.userId(), c.email(), c.firstName(), score, reason));
        }
        scored.sort(Comparator.comparingInt(EventMatch::score).reversed());
        return scored.stream().limit(maxMatches).toList();
    }

    /** True when a candidate skill is referenced in the event text: exact token,
     *  or any of its tokens equals / shares a prefix with an event token. */
    private static boolean skillMatches(String skill, Set<String> eventTokens) {
        String s = skill == null ? "" : skill.toLowerCase(Locale.ROOT).trim();
        if (s.isEmpty()) return false;
        if (eventTokens.contains(s)) return true;
        for (String st : tokenize(s)) {
            if (st.length() < 3) continue;
            for (String et : eventTokens) {
                if (et.length() < 3) continue;
                if (st.equals(et) || st.startsWith(et) || et.startsWith(st)) return true;
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
