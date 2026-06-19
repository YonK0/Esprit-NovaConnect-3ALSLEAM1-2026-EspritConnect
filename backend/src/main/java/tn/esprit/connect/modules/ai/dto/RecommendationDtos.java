package tn.esprit.connect.modules.ai.dto;

import java.util.List;
import java.util.UUID;

public final class RecommendationDtos {
    private RecommendationDtos() {}

    public record CandidateRecommendation(
            UUID userId,
            String firstName,
            String lastName,
            String email,
            String headline,
            Integer promotionYear,
            String specialtyCode,
            List<String> matchingSkills,
            int matchScore,        // 0..100
            String reason,
            String avatarUrl,
            boolean openToWork
    ) {}

    public record JobRecommendations(
            UUID jobOfferId,
            String jobTitle,
            List<CandidateRecommendation> candidates,
            boolean aiEnabled,
            String fallbackReason   // populated when AI is unavailable
    ) {}

    /** One job scored against a single viewer's profile (Bug-1: real match %). */
    public record JobMatch(
            UUID jobId,
            String title,
            String companyName,
            String location,
            boolean remote,
            List<String> matchingSkills,
            int matchScore,        // 0..100
            String reason
    ) {}

    /** "Best jobs for me" — the viewer-facing counterpart to JobRecommendations. */
    public record ViewerJobRecommendations(
            List<JobMatch> matches,
            boolean aiEnabled,
            String fallbackReason   // populated when AI is unavailable
    ) {}

    /** A job opening ranked against the current user's profile / CV. */
    public record JobMatchRecommendation(
            UUID jobOfferId,
            String title,
            String companyName,
            String type,
            String location,
            boolean remote,
            List<String> matchingSkills,
            int matchScore,
            String reason
    ) {}

    public record UserJobRecommendations(
            List<JobMatchRecommendation> jobs,
            boolean aiEnabled,
            String fallbackReason
    ) {}
}
