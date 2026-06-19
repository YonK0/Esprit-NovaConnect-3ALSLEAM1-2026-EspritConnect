package tn.esprit.connect.modules.ai;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.ai.dto.AssistantDtos.*;
import tn.esprit.connect.modules.notification.repository.NotificationRepository;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;

import java.util.*;

/**
 * The "esprit ASSISTANT" widget backend.
 *
 * Two-step pipeline:
 *  1. Classify the user's message into an intent ({@code SEARCH_ALUMNI}, {@code SEARCH_JOB},
 *     {@code SEARCH_MENTOR}, {@code SUMMARIZE_NOTIFICATIONS}, {@code DRAFT_MESSAGE},
 *     {@code FREE_CHAT}) using Ollama JSON mode.
 *  2. Execute the intent against the DB and, where useful, ask Ollama to phrase the reply.
 *
 * Falls back to keyword routing when Ollama is unavailable so the assistant degrades gracefully.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatAssistantService {

    private final OllamaService ollama;
    private final JdbcTemplate jdbc;
    private final ProfileRepository profileRepository;
    private final NotificationRepository notificationRepository;

    @Transactional(readOnly = true)
    public ChatResponse chat(UUID viewerUserId, ChatRequest req) {
        String message = req.message().trim();
        String locale  = (req.locale() == null || req.locale().isBlank()) ? "en" : req.locale();

        Intent intent = classify(message);
        log.debug("Assistant intent={} for message='{}'", intent.name, message);

        return switch (intent.name) {
            case "SEARCH_ALUMNI"   -> searchAlumni(message, intent.slots, locale);
            case "SEARCH_JOB"      -> searchJobs(message, intent.slots, locale);
            case "SEARCH_MENTOR"   -> searchMentors(message, intent.slots, locale);
            case "SUMMARIZE_NOTIFICATIONS" -> summarizeNotifications(viewerUserId, locale);
            case "DRAFT_MESSAGE"   -> draftMessage(viewerUserId, message, locale);
            default                -> freeChat(viewerUserId, message, locale);
        };
    }

    // ===================== Intent classification =====================

    private record Intent(String name, Map<String, String> slots) {}

    private Intent classify(String message) {
        // Greetings, small talk, and meta/identity questions are NEVER a DB
        // search — answer them conversationally. Skips a wasted LLM router call
        // and prevents a small router model from misfiring (e.g. "who are you"
        // → alumni search).
        String lower = message.toLowerCase(Locale.ROOT).trim();
        if (lower.length() < 6 || isGreeting(lower) || isMetaOrSmallTalk(lower)) {
            return new Intent("FREE_CHAT", Map.of());
        }

        if (!ollama.isEnabled()) return keywordRoute(message);

        String system = """
            You are a router for the ESPRIT alumni network assistant.
            Given the user's message, return JSON of the exact shape:
              { "intent": "<one of SEARCH_ALUMNI, SEARCH_JOB, SEARCH_MENTOR,
                            SUMMARIZE_NOTIFICATIONS, DRAFT_MESSAGE, FREE_CHAT>",
                "slots": { "company": "...", "city": "...", "specialty": "...",
                           "promotion": "...", "skill": "...", "topic": "..." } }
            Use empty strings for slots that don't apply. Do not invent values.
            """;

        JsonNode node = ollama.chatJson(system, message);
        if (node == null || !node.has("intent")) return keywordRoute(message);

        String name = node.path("intent").asText("FREE_CHAT");
        Map<String, String> slots = new HashMap<>();
        node.path("slots").fields().forEachRemaining(e -> {
            String v = e.getValue().asText("");
            if (!v.isBlank()) slots.put(e.getKey(), v);
        });

        // Guard against a weak router model labelling a general question as a
        // search/draft. Such an intent must be backed by an extracted slot OR a
        // domain keyword in the message; otherwise treat it as FREE_CHAT so the
        // model just answers (e.g. "who are you", "what's the weather").
        boolean actionable = !"FREE_CHAT".equals(name) && !"SUMMARIZE_NOTIFICATIONS".equals(name);
        if (actionable && slots.isEmpty() && "FREE_CHAT".equals(keywordRoute(message).name)) {
            return new Intent("FREE_CHAT", Map.of());
        }
        return new Intent(name, slots);
    }

    /** Identity / capability / thanks questions — answered conversationally,
     *  never routed to a DB search. Kept narrow so real requests like
     *  "help me find a job" still reach the search intents. */
    private static boolean isMetaOrSmallTalk(String m) {
        return m.matches("(?i).*(who|what)\\s+(are|r)\\s+you.*")
            || m.matches("(?i).*who\\s+(made|created|built)\\s+you.*")
            || m.matches("(?i).*what\\s+can\\s+you\\s+do.*")
            || m.matches("(?i).*what('?s| is)\\s+(this|espritconnect|esprit connect).*")
            || m.matches("(?i)\\s*(thanks|thank you|thx|merci)[\\s\\p{Punct}]*")
            || m.contains("qui es-tu") || m.contains("qui êtes-vous")
            || m.contains("tu es qui") || m.contains("que peux-tu faire");
    }

    /** Pure-Latin / French greetings — used by the classify fast-path. */
    private static boolean isGreeting(String m) {
        return m.matches("(?i)^(hi|hey|hello|yo|hola|salut|bonjour|coucou|good\\s+(morning|afternoon|evening))[\\s\\p{Punct}]*$");
    }

    private Intent keywordRoute(String m) {
        String lower = m.toLowerCase(Locale.ROOT);
        if (lower.contains("internship") || lower.contains("stage") || lower.contains("job") || lower.contains("emploi"))
            return new Intent("SEARCH_JOB", Map.of());
        if (lower.contains("mentor")) return new Intent("SEARCH_MENTOR", Map.of());
        if (lower.contains("notification")) return new Intent("SUMMARIZE_NOTIFICATIONS", Map.of());
        if (lower.contains("draft") || lower.contains("écrir") || lower.contains("ecrire"))
            return new Intent("DRAFT_MESSAGE", Map.of());
        if (lower.contains("alumni") || lower.contains("alumnus") || lower.contains("find me"))
            return new Intent("SEARCH_ALUMNI", Map.of());
        return new Intent("FREE_CHAT", Map.of());
    }

    // ===================== Intent handlers =====================

    private ChatResponse searchAlumni(String msg, Map<String, String> slots, String locale) {
        StringBuilder sql = new StringBuilder("""
            SELECT u.id, u.email, p.first_name, p.last_name, p.headline, p.city,
                   pr.year, s.code
            FROM users u
            JOIN profiles p ON p.user_id = u.id
            LEFT JOIN promotions pr ON pr.id = p.promotion_id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE' AND p.is_searchable = true
            """);
        List<Object> args = new ArrayList<>();
        if (slots.containsKey("specialty")) {
            sql.append(" AND lower(s.code) = lower(?)");
            args.add(slots.get("specialty"));
        }
        if (slots.containsKey("promotion")) {
            try { args.add(Integer.parseInt(slots.get("promotion"))); sql.append(" AND pr.year = ?"); }
            catch (NumberFormatException ignored) {}
        }
        if (slots.containsKey("city")) {
            sql.append(" AND lower(p.city) LIKE lower(?)");
            args.add("%" + slots.get("city") + "%");
        }
        if (slots.containsKey("company")) {
            sql.append(" AND lower(p.headline) LIKE lower(?)");
            args.add("%" + slots.get("company") + "%");
        }
        if (slots.containsKey("skill")) {
            sql.append(" AND p.id IN (SELECT profile_id FROM skills WHERE lower(name) LIKE lower(?))");
            args.add("%" + slots.get("skill") + "%");
        }
        sql.append(" ORDER BY pr.year DESC NULLS LAST LIMIT 8");

        List<ResultCard> cards = jdbc.query(sql.toString(), args.toArray(), (rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            String name = rs.getString("first_name") + " " + rs.getString("last_name");
            String headline = rs.getString("headline");
            String code = rs.getString("code");
            Object year = rs.getObject("year");
            return new ResultCard("ALUMNUS", id, name,
                    headline == null ? rs.getString("email") : headline,
                    (code == null ? "?" : code) + (year == null ? "" : " · " + year),
                    "/profiles/" + id);
        });

        String reply = cards.isEmpty()
                ? loc(locale,
                    "No alumni matched those filters yet.",
                    "Aucun alumni ne correspond à ces filtres pour le moment.")
                : loc(locale,
                    "Found " + cards.size() + " alumni matching your query.",
                    "J'ai trouvé " + cards.size() + " alumni qui correspondent.");

        return new ChatResponse(reply, cards, defaultFollowUps(locale), ollama.isEnabled(), "SEARCH_ALUMNI");
    }

    private ChatResponse searchJobs(String msg, Map<String, String> slots, String locale) {
        StringBuilder sql = new StringBuilder("""
            SELECT j.id, j.title, c.name AS company, j.location, j.type, j.is_remote
            FROM job_offers j JOIN companies c ON c.id = j.company_id
            WHERE j.deleted_at IS NULL AND j.moderation_status = 'APPROVED'
            """);
        List<Object> args = new ArrayList<>();
        if (slots.containsKey("city")) {
            sql.append(" AND lower(j.location) LIKE lower(?)");
            args.add("%" + slots.get("city") + "%");
        }
        if (slots.containsKey("company")) {
            sql.append(" AND lower(c.name) LIKE lower(?)");
            args.add("%" + slots.get("company") + "%");
        }
        if (slots.getOrDefault("topic", "").toLowerCase(Locale.ROOT).contains("intern")
                || slots.getOrDefault("topic", "").toLowerCase(Locale.ROOT).contains("stage")) {
            sql.append(" AND j.type = 'INTERNSHIP'");
        }
        sql.append(" ORDER BY j.created_at DESC LIMIT 8");

        List<ResultCard> cards = jdbc.query(sql.toString(), args.toArray(), (rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            String loc = rs.getString("location");
            boolean remote = rs.getBoolean("is_remote");
            String subtitle = rs.getString("company") + " · " + (loc == null ? "Remote" : loc);
            return new ResultCard("JOB", id, rs.getString("title"), subtitle,
                    rs.getString("type") + (remote ? " · REMOTE" : ""),
                    "/jobs");
        });

        String reply = cards.isEmpty()
                ? loc(locale, "No open jobs match yet.", "Aucune offre ne correspond.")
                : loc(locale,
                    cards.size() + " open job(s) found.",
                    "J'ai trouvé " + cards.size() + " offre(s) en cours.");

        return new ChatResponse(reply, cards, defaultFollowUps(locale), ollama.isEnabled(), "SEARCH_JOB");
    }

    private ChatResponse searchMentors(String msg, Map<String, String> slots, String locale) {
        StringBuilder sql = new StringBuilder("""
            SELECT u.id, u.email, p.first_name, p.last_name, mp.bio,
                   s.code AS specialty, pr.year
            FROM mentor_profiles mp
            JOIN users u    ON u.id = mp.user_id
            JOIN profiles p ON p.user_id = u.id
            LEFT JOIN specialties s ON s.id = p.specialty_id
            LEFT JOIN promotions pr ON pr.id = p.promotion_id
            WHERE mp.deleted_at IS NULL AND mp.moderation_status = 'APPROVED'
            """);
        List<Object> args = new ArrayList<>();
        if (slots.containsKey("specialty")) {
            sql.append(" AND lower(s.code) = lower(?)");
            args.add(slots.get("specialty"));
        }
        sql.append(" ORDER BY pr.year DESC NULLS LAST LIMIT 8");

        List<ResultCard> cards = jdbc.query(sql.toString(), args.toArray(), (rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            String name = rs.getString("first_name") + " " + rs.getString("last_name");
            String code = rs.getString("specialty");
            Object year = rs.getObject("year");
            return new ResultCard("MENTOR", id, name,
                    truncate(rs.getString("bio"), 100),
                    (code == null ? "?" : code) + (year == null ? "" : " · " + year),
                    "/profiles/" + id);
        });

        String reply = cards.isEmpty()
                ? loc(locale, "No mentors available right now.", "Aucun mentor disponible pour le moment.")
                : loc(locale,
                    "Found " + cards.size() + " mentor(s) accepting requests.",
                    "J'ai trouvé " + cards.size() + " mentor(s) qui acceptent un mentorat.");

        return new ChatResponse(reply, cards, defaultFollowUps(locale), ollama.isEnabled(), "SEARCH_MENTOR");
    }

    private ChatResponse summarizeNotifications(UUID viewerId, String locale) {
        long unread = notificationRepository.countByUserIdAndReadFalse(viewerId);
        String reply = unread == 0
                ? loc(locale, "You have no unread notifications.", "Aucune notification non lue.")
                : loc(locale,
                    "You have " + unread + " unread notification(s). Open the bell to see them.",
                    "Vous avez " + unread + " notification(s) non lue(s). Ouvrez la cloche pour les voir.");
        return new ChatResponse(reply, List.of(),
                List.of(new QuickAction(loc(locale, "Open notifications", "Voir les notifications"),
                        "Open my notifications")),
                ollama.isEnabled(), "SUMMARIZE_NOTIFICATIONS");
    }

    private ChatResponse draftMessage(UUID viewerId, String userMsg, String locale) {
        if (!ollama.isEnabled()) {
            return new ChatResponse(
                    loc(locale,
                        "AI is offline — drafting needs the local model. Try again later.",
                        "L'IA est hors-ligne — la rédaction nécessite le modèle local."),
                    List.of(), defaultFollowUps(locale), false, "DRAFT_MESSAGE");
        }
        Profile p = profileRepository.findByUserId(viewerId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile", viewerId));

        String system = """
            You are an assistant that drafts short, warm reconnect messages between
            ESPRIT alumni. Keep it under 80 words. Match the user's locale.
            Return ONLY the message body, no preamble.
            """;
        String prompt = "User profile: " + p.getFirstName() + " " + p.getLastName()
                + ", " + (p.getHeadline() == null ? "ESPRIT alumnus" : p.getHeadline())
                + "\nUser request: " + userMsg
                + "\nLocale: " + locale;
        String drafted = ollama.generate(prompt);
        String reply = drafted == null
                ? loc(locale, "Could not draft a message right now.", "Impossible de rédiger un message.")
                : drafted.trim();
        return new ChatResponse(reply, List.of(), defaultFollowUps(locale), true, "DRAFT_MESSAGE");
    }

    private ChatResponse freeChat(UUID viewerId, String userMsg, String locale) {
        if (!ollama.isEnabled()) {
            // Even without Ollama we give a useful answer for the most common
            // "how do I do X" questions — better than just "AI is offline".
            String hint = offlineHint(userMsg, locale);
            return new ChatResponse(
                    hint != null ? hint
                                 : loc(locale,
                        "AI is offline. Try a structured query like \"find AI mentors from promo 2018\".",
                        "L'IA est hors-ligne. Essayez une requête structurée comme « trouve des mentors IA promo 2018 »."),
                    List.of(), defaultFollowUps(locale), false, "FREE_CHAT");
        }
        // Strong system prompt — gives the model concrete knowledge about
        // EspritConnect features so it can answer "where do I find X" and
        // "how do I do Y" without making things up.
        String system = """
            You are "esprit ASSISTANT", the in-app helper for EspritConnect — the
            ESPRIT University alumni & student network. Be friendly, concise (max 120
            words), and ALWAYS match the user's locale (FR or EN).

            App features you can refer the user to (use the path in parentheses):
              • Feed (/feed) — post updates, images, GIFs, repost others' posts,
                react, comment.
              • Directory (/directory) — search alumni by name, specialty (GL, IA, RT,
                INFOTRONIC, CIVIL, MECA), country, city, promotion year range, with
                grid + Leaflet map view.
              • Network (/network) — pending/accepted connections, "People you may know"
                suggestions, send invitations with a personal note (LinkedIn-style).
              • Messaging (/messaging) — 1:1 chat with any user you can reach.
              • Mentorship (/mentorship) — find mentors, request a session, become a
                mentor at /mentorship/become.
              • Jobs (/jobs) — search by type/location/specialty/remote, one-click
                apply with CV. Recruiters can post (/jobs/new) and see applications
                (/jobs/{id}/applications).
              • Events (/events) — RSVP (Going / Maybe), see speakers + agenda. Create
                via /events/new.
              • Groups (/groups) — promo / specialty / region / interest. Join, leave,
                request to join private groups. Create at /groups/new.
              • Profile (/profile/me) — edit bio/headline/city, upload CV (PDF),
                upload avatar, import experience+skills+education from a PDF CV with
                AI parsing, manage skills with endorsements, view badges.
              • Notifications — bell icon in the header. Mark all read button.
              • Admin (/admin) — for admins only: approve users, moderate content,
                manage per-user permissions.

            Rules:
              • Refuse to invent alumni names, job postings, or events. If asked,
                say you'd need to search and suggest the relevant page.
              • Always link to the right path when you mention a feature.
              • Refuse off-topic questions politely — you only help with the network.
            """;
        String prompt = userMsg + "\n\nUser locale: " + locale;
        String reply = ollama.generate(system + "\n\n---\n\nUser message:\n" + prompt);
        return new ChatResponse(
                reply == null ? loc(locale, "Sorry — I couldn't reach the AI model. Make sure Ollama is running.",
                                            "Désolé — je n'ai pas pu joindre le modèle IA. Vérifiez qu'Ollama tourne.")
                              : reply.trim(),
                List.of(), defaultFollowUps(locale), true, "FREE_CHAT");
    }

    /** Cheap offline hint for very common "how do I…" questions, so the
     *  assistant is still useful when Ollama is offline. Pattern-matched. */
    private static String offlineHint(String userMsg, String locale) {
        String m = userMsg.toLowerCase(Locale.ROOT);
        boolean fr = "fr".equalsIgnoreCase(locale);
        if (m.contains("cv") || m.contains("resume") || m.contains("upload"))
            return fr ? "Pour téléverser un CV: /profile/me → Edit profile → Upload CV. Vous pouvez aussi importer expériences & compétences depuis un PDF."
                      : "To upload a CV: /profile/me → Edit profile → Upload CV. You can also import experience & skills from a PDF.";
        if (m.contains("post") && (m.contains("image") || m.contains("photo")))
            return fr ? "Pour publier une image: /feed → cliquez « 📷 Add image / GIF » sous la zone de texte."
                      : "To post an image: /feed → click \"📷 Add image / GIF\" under the text area.";
        if (m.contains("mentor"))
            return fr ? "Trouvez un mentor: /mentorship. Pour proposer du mentorat: /mentorship/become."
                      : "Find a mentor at /mentorship. To offer mentorship: /mentorship/become.";
        if (m.contains("job") || m.contains("emploi") || m.contains("stage"))
            return fr ? "Recherche d'emploi: /jobs (filtres type, lieu, spécialité, remote)."
                      : "Job search: /jobs (filters by type, location, specialty, remote).";
        if (m.contains("event") || m.contains("événement"))
            return fr ? "Événements: /events. Pour créer: /events/new."
                      : "Events: /events. Create one at /events/new.";
        if (m.contains("password") || m.contains("mot de passe"))
            return fr ? "Mot de passe oublié: contactez un admin qui peut envoyer un lien de réinitialisation."
                      : "Forgot password: ask an admin to send you a reset link.";
        if (m.contains("avatar") || m.contains("photo de profil") || m.contains("profile picture"))
            return fr ? "Photo de profil: /profile/me → cliquez sur la photo ronde en haut."
                      : "Profile picture: /profile/me → click the circular avatar at the top.";
        return null;
    }

    // ===================== Helpers =====================

    private static String loc(String locale, String en, String fr) {
        return "fr".equalsIgnoreCase(locale) ? fr : en;
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private static List<QuickAction> defaultFollowUps(String locale) {
        return "fr".equalsIgnoreCase(locale)
                ? List.of(
                    new QuickAction("Voir tous les résultats", "Show all results"),
                    new QuickAction("Filtrer par pays", "Filter by country"))
                : List.of(
                    new QuickAction("Show all results", "Show all results"),
                    new QuickAction("Filter by country", "Filter by country"));
    }
}
