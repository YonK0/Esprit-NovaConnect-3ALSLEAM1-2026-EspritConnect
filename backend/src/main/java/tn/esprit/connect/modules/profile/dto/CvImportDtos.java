package tn.esprit.connect.modules.profile.dto;

import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobMatchRecommendation;

import java.time.LocalDate;
import java.util.List;

/**
 * Result of parsing an uploaded CV PDF.
 *
 * The parser is best-effort: dates may be partial (year only), descriptions
 * may be missing. The frontend renders these as a preview where the user
 * picks which items to actually import.
 *
 * `confidence` is a 0..1 hint about how reliable the extraction was — low
 * when the parser fell back to regex because Ollama was unavailable; high
 * when Ollama returned a well-structured response.
 */
public final class CvImportDtos {
    private CvImportDtos() {}

    public record ParsedExperience(
            String title,
            String company,
            String location,
            LocalDate startDate,
            LocalDate endDate,        // nullable = "Present"
            String description
    ) {}

    public record ParsedSkill(
            String name,
            Integer level             // 1..5, nullable when the CV doesn't say
    ) {}

    public record ParsedEducation(
            String title,             // degree
            String subtitle,          // school / institution
            String period             // e.g. "2018 — 2021"
    ) {}

    public record CvPreview(
            String headline,          // first non-empty line / extracted title
            String summary,           // an "About" paragraph if present
            List<ParsedExperience> experiences,
            List<ParsedSkill> skills,
            List<ParsedEducation> education,
            double confidence,
            String aiProvider         // "ollama" | "regex"
    ) {}

    public record CvImportRequest(
            boolean importHeadline,
            String headline,              // null/blank if importHeadline=false
            boolean importSummary,
            String summary,               // null/blank if importSummary=false
            List<ParsedExperience> experiences,
            List<ParsedSkill> skills,
            List<ParsedEducation> education
    ) {}

    public record CvImportResult(
            int experiencesAdded,
            int skillsAdded,
            int educationAdded,
            boolean headlineUpdated,
            boolean summaryUpdated,
            List<JobMatchRecommendation> suggestedJobs
    ) {}
}
