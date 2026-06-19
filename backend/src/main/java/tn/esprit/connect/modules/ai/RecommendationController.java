package tn.esprit.connect.modules.ai;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.JobRecommendations;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.ViewerJobRecommendations;
import tn.esprit.connect.modules.ai.dto.RecommendationDtos.UserJobRecommendations;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/recommendations")
@RequiredArgsConstructor
@Tag(name = "AI · Recommendations")
public class RecommendationController {

    private final RecommendationService service;

    @GetMapping("/job/{id}")
    @PreAuthorize("hasAnyRole('RECRUITER','ADMIN')")
    @Operation(summary = "AI-ranked candidate list for a job (Ollama, with heuristic fallback)")
    public ResponseEntity<JobRecommendations> forJob(@PathVariable UUID id) {
        return ResponseEntity.ok(service.recommend(id));
    }

    @GetMapping("/jobs/me")
    @Operation(summary = "AI-ranked jobs for the current viewer's profile (Ollama, with heuristic fallback)")
    public ResponseEntity<ViewerJobRecommendations> forMe(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestParam(defaultValue = "30") int limit) {
        return ResponseEntity.ok(service.recommendForViewer(u.getId(), limit));
    }

    @GetMapping("/for-me")
    @Operation(summary = "Job openings ranked for the current user (profile / CV skills)")
    public ResponseEntity<UserJobRecommendations> forMeFromCv(
            @AuthenticationPrincipal CustomUserDetails u) {
        return ResponseEntity.ok(service.recommendJobsForUser(u.getId()));
    }
}
