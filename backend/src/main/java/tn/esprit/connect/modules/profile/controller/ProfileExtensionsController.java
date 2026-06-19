package tn.esprit.connect.modules.profile.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.profile.dto.CvImportDtos;
import tn.esprit.connect.modules.profile.dto.ProfileExtensionsDtos.*;
import tn.esprit.connect.modules.profile.service.CvParserService;
import tn.esprit.connect.modules.profile.service.ProfileExtensionsService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles")
@RequiredArgsConstructor
@Tag(name = "Profile · extensions")
public class ProfileExtensionsController {

    private final ProfileExtensionsService svc;
    private final CvParserService cvParser;

    // -------- Experiences --------

    @GetMapping("/{profileId}/experiences")
    public ResponseEntity<List<ExperienceResponse>> listExperiences(@PathVariable UUID profileId) {
        return ResponseEntity.ok(svc.experiencesOfProfile(profileId));
    }

    @PostMapping("/me/experiences")
    public ResponseEntity<ExperienceResponse> addExperience(
            @AuthenticationPrincipal CustomUserDetails u,
            @Valid @RequestBody CreateExperience req) {
        return ResponseEntity.status(201).body(svc.addExperience(u.getId(), req));
    }

    @PatchMapping("/me/experiences/{id}")
    public ResponseEntity<ExperienceResponse> updateExperience(
            @AuthenticationPrincipal CustomUserDetails u,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateExperience req) {
        return ResponseEntity.ok(svc.updateExperience(u.getId(), id, req));
    }

    @DeleteMapping("/me/experiences/{id}")
    public ResponseEntity<Void> deleteExperience(@AuthenticationPrincipal CustomUserDetails u,
                                                 @PathVariable UUID id) {
        svc.deleteExperience(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    // -------- Achievements --------

    @GetMapping("/{profileId}/achievements")
    public ResponseEntity<List<AchievementResponse>> listAchievements(@PathVariable UUID profileId) {
        return ResponseEntity.ok(svc.achievementsOfProfile(profileId));
    }

    @PostMapping("/me/achievements")
    public ResponseEntity<AchievementResponse> addAchievement(
            @AuthenticationPrincipal CustomUserDetails u,
            @Valid @RequestBody CreateAchievement req) {
        return ResponseEntity.status(201).body(svc.addAchievement(u.getId(), req));
    }

    @DeleteMapping("/me/achievements/{id}")
    public ResponseEntity<Void> deleteAchievement(@AuthenticationPrincipal CustomUserDetails u,
                                                  @PathVariable UUID id) {
        svc.deleteAchievement(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    // -------- Skills + Endorsements --------

    @GetMapping("/{profileId}/skills")
    public ResponseEntity<List<SkillResponse>> listSkills(
            @PathVariable UUID profileId,
            @AuthenticationPrincipal CustomUserDetails u) {
        UUID viewerId = u == null ? null : u.getId();
        return ResponseEntity.ok(svc.skillsOfProfile(profileId, viewerId));
    }

    @PostMapping("/me/skills")
    public ResponseEntity<SkillResponse> addSkill(@AuthenticationPrincipal CustomUserDetails u,
                                                  @Valid @RequestBody CreateSkill req) {
        return ResponseEntity.status(201).body(svc.addSkill(u.getId(), req));
    }

    @DeleteMapping("/me/skills/{id}")
    public ResponseEntity<Void> deleteSkill(@AuthenticationPrincipal CustomUserDetails u,
                                            @PathVariable UUID id) {
        svc.deleteSkill(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/skills/{id}/endorse")
    public ResponseEntity<Void> endorse(@AuthenticationPrincipal CustomUserDetails u,
                                        @PathVariable UUID id) {
        svc.endorse(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/skills/{id}/endorse")
    public ResponseEntity<Void> removeEndorsement(@AuthenticationPrincipal CustomUserDetails u,
                                                  @PathVariable UUID id) {
        svc.removeEndorsement(u.getId(), id);
        return ResponseEntity.noContent().build();
    }

    // -------- CV URL --------

    public record CvUrlRequest(@NotBlank @Size(max = 512) String cvUrl) {}

    @PutMapping("/me/cv")
    public ResponseEntity<Void> setCvUrl(@AuthenticationPrincipal CustomUserDetails u,
                                         @Valid @RequestBody CvUrlRequest req) {
        svc.setCvUrl(u.getId(), req.cvUrl());
        return ResponseEntity.noContent().build();
    }

    // -------- CV parsing (PDF → preview → import) --------

    /** Stage 1: user uploads a PDF, we return a structured preview but do not
     * touch their profile yet. The frontend renders the preview and lets the
     * user de-select rows before calling /me/cv/import. */
    @PostMapping(value = "/me/cv/parse", consumes = "multipart/form-data")
    public ResponseEntity<CvImportDtos.CvPreview> parseCv(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(cvParser.parse(file));
    }

    /** Stage 2: commit the (possibly edited) preview to the profile.
     * Idempotent for skills (upsert by name); appends experiences and
     * education — duplicates are the user's responsibility. */
    @PostMapping("/me/cv/import")
    public ResponseEntity<CvImportDtos.CvImportResult> importCv(
            @AuthenticationPrincipal CustomUserDetails u,
            @RequestBody CvImportDtos.CvImportRequest req) {
        return ResponseEntity.ok(svc.importCv(u.getId(), req));
    }
}
