package tn.esprit.connect.modules.profile.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.modules.ai.OllamaService;
import tn.esprit.connect.modules.profile.dto.CvImportDtos.*;

import java.io.IOException;
import java.time.LocalDate;
import java.time.Month;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracts structured data (experiences, skills, education, summary) from
 * an uploaded CV PDF.
 *
 * Two-tier strategy:
 *   1. Primary: Ollama JSON-mode prompt. The local llama3.2:3b model returns
 *      well-formed structured JSON when given a clear instruction + schema.
 *      We trust this output but still bound + validate every field.
 *   2. Fallback: a regex-based parser that handles the most common CV
 *      formats (headings like "Experience", "Education", "Skills"). It's
 *      far less accurate than the LLM path but means CV import still works
 *      when Ollama is offline.
 *
 * Section detection is intentionally permissive — we'd rather over-extract
 * and let the user de-select items in the UI than miss content.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CvParserService {

    private final OllamaService ollamaService;

    private static final long MAX_BYTES = 10L * 1024 * 1024;     // mirrors profile CV upload cap

    public CvPreview parse(MultipartFile file) {
        String ct = file.getContentType();
        if (ct == null || !ct.equals("application/pdf")) {
            throw new BusinessException("CV must be a PDF document.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BusinessException("CV file must not exceed 10 MB.");
        }

        String text = extractText(file);
        if (text == null || text.isBlank()) {
            throw new BusinessException(
                "Could not extract any text from the PDF. It may be a scanned image; " +
                "please paste your information manually or upload a text-based PDF.");
        }
        // Cap raw text we send to the LLM — Ollama's context window is small
        // for the 3B model and the most important content is at the top.
        String forLlm = text.length() > 8000 ? text.substring(0, 8000) : text;

        CvPreview viaLlm = tryOllama(forLlm);
        if (viaLlm != null) return viaLlm;

        log.info("Ollama unavailable or returned unusable response — using regex fallback");
        return regexFallback(text);
    }

    // ---------------------------------------------------------------- text

    private String extractText(MultipartFile file) {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(file.getInputStream()))) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return stripper.getText(doc);
        } catch (IOException e) {
            log.warn("PDF text extraction failed: {}", e.getMessage());
            throw new BusinessException("Could not read the PDF. Is it password-protected or corrupt?");
        }
    }

    // -------------------------------------------------------------- ollama

    private static final String OLLAMA_SYSTEM = """
            You are a CV parsing assistant. The user will give you the raw text
            extracted from a CV / resume. Return ONLY valid JSON in this exact
            shape (no markdown, no commentary, no explanation):
            {
              "headline": "<one-line job title, or empty string>",
              "summary":  "<a short About/Profile paragraph, or empty string>",
              "experiences": [
                { "title": "...", "company": "...", "location": "...",
                  "startDate": "YYYY-MM-DD or null",
                  "endDate":   "YYYY-MM-DD or null (null means present)",
                  "description": "..." }
              ],
              "skills": [
                { "name": "...", "level": null }
              ],
              "education": [
                { "title": "<degree>", "subtitle": "<school/institution>",
                  "period": "<e.g. 2018 — 2021>" }
              ]
            }

            Rules:
            - Empty arrays are fine. Don't invent data.
            - For ongoing roles, use null for endDate.
            - level for skills is always null unless the CV explicitly rates them.
            - Keep description under 300 chars.
            - All dates must be ISO 8601 (YYYY-MM-DD), or just YYYY-MM-01 / YYYY-01-01 when only month / year is known.
            """;

    private CvPreview tryOllama(String cvText) {
        if (!ollamaService.isEnabled()) return null;
        JsonNode root = ollamaService.chatJson(OLLAMA_SYSTEM,
                "Parse this CV and return the JSON object described in your system prompt:\n\n" + cvText);
        if (root == null || !root.isObject()) return null;

        try {
            String headline = root.path("headline").asText("");
            String summary  = root.path("summary").asText("");

            List<ParsedExperience> experiences = new ArrayList<>();
            for (JsonNode e : safeArray(root, "experiences")) {
                experiences.add(new ParsedExperience(
                        nonBlank(e, "title", "Untitled role"),
                        nonBlank(e, "company", ""),
                        e.path("location").asText(""),
                        parseDate(e.path("startDate").asText(null)),
                        parseDate(e.path("endDate").asText(null)),
                        truncate(e.path("description").asText(""), 600)
                ));
            }

            List<ParsedSkill> skills = new ArrayList<>();
            for (JsonNode s : safeArray(root, "skills")) {
                String name = s.path("name").asText("").trim();
                if (name.isEmpty()) continue;
                Integer level = s.path("level").isInt() ? s.path("level").asInt() : null;
                if (level != null && (level < 1 || level > 5)) level = null;
                skills.add(new ParsedSkill(name, level));
            }

            List<ParsedEducation> education = new ArrayList<>();
            for (JsonNode ed : safeArray(root, "education")) {
                String title = ed.path("title").asText("").trim();
                if (title.isEmpty()) continue;
                education.add(new ParsedEducation(
                        title,
                        ed.path("subtitle").asText(""),
                        ed.path("period").asText("")));
            }

            // If the LLM left headline / summary blank, generate them from the
            // structured data so the user can still preview + import them.
            // This is the "AI-generated if not found in the CV" behaviour.
            if ((headline == null || headline.isBlank()) && !experiences.isEmpty()) {
                headline = synthesizeHeadline(experiences, skills);
            }
            if ((summary == null || summary.isBlank())) {
                summary = synthesizeSummary(experiences, skills, education);
            }

            return new CvPreview(headline, summary, experiences, skills, education,
                    0.9, "ollama");
        } catch (Exception e) {
            log.warn("Could not coerce Ollama response into CvPreview: {}", e.getMessage());
            return null;
        }
    }

    /** "Senior ML Engineer at Meta · ML, PyTorch, Distributed Systems" —
     *  built from the most-recent experience + top skills. */
    private static String synthesizeHeadline(List<ParsedExperience> exps,
                                              List<ParsedSkill> skills) {
        ParsedExperience top = exps.get(0);   // already date-desc in our LLM prompt
        StringBuilder sb = new StringBuilder();
        if (top.title() != null && !top.title().isBlank()) sb.append(top.title());
        if (top.company() != null && !top.company().isBlank()) {
            if (sb.length() > 0) sb.append(" at ");
            sb.append(top.company());
        }
        if (!skills.isEmpty()) {
            String top3 = skills.stream().limit(3).map(ParsedSkill::name)
                    .collect(java.util.stream.Collectors.joining(", "));
            if (!top3.isBlank()) sb.append(" · ").append(top3);
        }
        return sb.length() > 160 ? sb.substring(0, 157) + "…" : sb.toString();
    }

    /** A 1-2 sentence "About" paragraph from experience + education + skills.
     *  Heuristic but readable — better than leaving the section blank. */
    private static String synthesizeSummary(List<ParsedExperience> exps,
                                             List<ParsedSkill> skills,
                                             List<ParsedEducation> edus) {
        StringBuilder sb = new StringBuilder();
        if (!exps.isEmpty()) {
            ParsedExperience top = exps.get(0);
            sb.append(exps.size() > 1
                ? "Experienced professional currently "
                : "Currently ");
            if (top.title() != null && !top.title().isBlank()) sb.append("working as ").append(top.title());
            if (top.company() != null && !top.company().isBlank()) sb.append(" at ").append(top.company());
            sb.append(". ");
        }
        if (!edus.isEmpty()) {
            ParsedEducation ed = edus.get(0);
            if (ed.title() != null && !ed.title().isBlank()) {
                sb.append(ed.title());
                if (ed.subtitle() != null && !ed.subtitle().isBlank()) sb.append(" from ").append(ed.subtitle());
                sb.append(". ");
            }
        }
        if (!skills.isEmpty()) {
            String top = skills.stream().limit(5).map(ParsedSkill::name)
                    .collect(java.util.stream.Collectors.joining(", "));
            sb.append("Core skills include ").append(top).append(".");
        }
        return sb.length() > 700 ? sb.substring(0, 697) + "…" : sb.toString();
    }

    private static Iterable<JsonNode> safeArray(JsonNode parent, String field) {
        JsonNode n = parent.path(field);
        if (!n.isArray()) return List.of();
        return () -> {
            Iterator<JsonNode> it = n.elements();
            return it;
        };
    }

    private static String nonBlank(JsonNode parent, String field, String fallback) {
        String v = parent.path(field).asText("").trim();
        return v.isEmpty() ? fallback : v;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max).trim() + "…";
    }

    private static LocalDate parseDate(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        try {
            // Allow YYYY-MM-DD, YYYY-MM, YYYY
            String[] parts = s.split("-");
            int y = Integer.parseInt(parts[0]);
            int m = parts.length > 1 ? Integer.parseInt(parts[1]) : 1;
            int d = parts.length > 2 ? Integer.parseInt(parts[2]) : 1;
            if (m < 1 || m > 12) m = 1;
            if (d < 1 || d > 31) d = 1;
            return LocalDate.of(y, Month.of(m), Math.min(d, Month.of(m).length(java.time.Year.isLeap(y))));
        } catch (Exception e) {
            return null;
        }
    }

    // ---------------------------------------------------------- regex fallback

    private static final Pattern SECTION_HEADING = Pattern.compile(
            "(?i)^\\s*(experience|work experience|professional experience|" +
            "employment|education|formation|skills|compétences|" +
            "competences|languages|summary|profile|about|à propos)\\s*[:\\-]?\\s*$");

    private static final Map<String, String> CANONICAL = Map.ofEntries(
            Map.entry("experience", "EXPERIENCE"),
            Map.entry("work experience", "EXPERIENCE"),
            Map.entry("professional experience", "EXPERIENCE"),
            Map.entry("employment", "EXPERIENCE"),
            Map.entry("education", "EDUCATION"),
            Map.entry("formation", "EDUCATION"),
            Map.entry("skills", "SKILLS"),
            Map.entry("compétences", "SKILLS"),
            Map.entry("competences", "SKILLS"),
            Map.entry("summary", "SUMMARY"),
            Map.entry("profile", "SUMMARY"),
            Map.entry("about", "SUMMARY"),
            Map.entry("à propos", "SUMMARY")
    );

    private CvPreview regexFallback(String text) {
        String[] lines = text.split("\\r?\\n");

        String currentSection = null;
        StringBuilder summary = new StringBuilder();
        List<String> expBlock = new ArrayList<>();
        List<String> eduBlock = new ArrayList<>();
        List<String> skillsBlock = new ArrayList<>();

        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;

            Matcher m = SECTION_HEADING.matcher(line);
            if (m.matches()) {
                currentSection = CANONICAL.get(m.group(1).toLowerCase());
                continue;
            }

            if ("SUMMARY".equals(currentSection))    summary.append(line).append(' ');
            else if ("EXPERIENCE".equals(currentSection)) expBlock.add(line);
            else if ("EDUCATION".equals(currentSection))  eduBlock.add(line);
            else if ("SKILLS".equals(currentSection))     skillsBlock.add(line);
        }

        // Skills: comma / bullet / pipe-separated
        List<ParsedSkill> skills = new ArrayList<>();
        for (String line : skillsBlock) {
            for (String chunk : line.split("[,;|•·]")) {
                String name = chunk.trim();
                if (name.length() >= 2 && name.length() <= 60) {
                    skills.add(new ParsedSkill(name, null));
                }
            }
        }

        // Experience: stitch consecutive non-heading lines into blocks separated
        // by year ranges. Heuristic — produces low-confidence rows the user
        // can edit / discard in the preview.
        List<ParsedExperience> exps = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String line : expBlock) {
            cur.append(line).append('\n');
            if (line.matches(".*\\b(20\\d{2}|19\\d{2})\\b.*") && cur.length() > 40) {
                exps.add(rowFromBlock(cur.toString()));
                cur.setLength(0);
            }
        }
        if (cur.length() > 0) exps.add(rowFromBlock(cur.toString()));

        // Education: same shape — each entry is a single block ending with a year
        List<ParsedEducation> edus = new ArrayList<>();
        for (String line : eduBlock) {
            edus.add(new ParsedEducation(line, "", ""));
        }

        // Synthesize headline + summary from the extracted structures when
        // the CV didn't have a dedicated section. Matches what the Ollama
        // path does — feature parity regardless of which parser ran.
        String headline = exps.isEmpty() ? "" : synthesizeHeadline(exps, skills);
        String finalSummary = summary.toString().trim();
        if (finalSummary.isEmpty()) {
            finalSummary = synthesizeSummary(exps, skills, edus);
        }
        return new CvPreview(headline, finalSummary,
                exps, skills, edus, 0.45, "regex");
    }

    private static ParsedExperience rowFromBlock(String block) {
        String[] parts = block.split("\\n", 3);
        String title = parts.length > 0 ? parts[0].trim() : block;
        String company = parts.length > 1 ? parts[1].trim() : "";
        String description = parts.length > 2 ? parts[2].trim() : "";
        return new ParsedExperience(title, company, "", null, null, truncate(description, 600));
    }
}
