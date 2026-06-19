package tn.esprit.connect.modules.profile.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.profile.dto.ProfileResponse;
import tn.esprit.connect.modules.profile.dto.UpdateProfileRequest;
import tn.esprit.connect.modules.profile.service.ProfileService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/profiles")
@RequiredArgsConstructor
@Tag(name = "Profiles", description = "Profile read & update")
public class ProfileController {

    private final ProfileService profileService;

    @GetMapping("/me")
    @Operation(summary = "Current user's profile")
    public ResponseEntity<ProfileResponse> me(@AuthenticationPrincipal CustomUserDetails user) {
        return ResponseEntity.ok(profileService.getByUserId(user.getId()));
    }

    @PatchMapping("/me")
    @Operation(summary = "Update current user's profile (partial)")
    public ResponseEntity<ProfileResponse> updateMe(
            @AuthenticationPrincipal CustomUserDetails user,
            @Valid @RequestBody UpdateProfileRequest req) {
        return ResponseEntity.ok(profileService.update(user.getId(), req));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Profile by id")
    public ResponseEntity<ProfileResponse> get(@PathVariable UUID id) {
        return ResponseEntity.ok(profileService.getById(id));
    }

    @GetMapping("/by-user/{userId}")
    @Operation(summary = "Profile by user id (for the public profile page)")
    public ResponseEntity<ProfileResponse> getByUser(@PathVariable UUID userId) {
        return ResponseEntity.ok(profileService.getByUserId(userId));
    }

    @PostMapping(value = "/me/cv", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload CV file — returns updated profile with presigned cv_url")
    public ResponseEntity<ProfileResponse> uploadCv(
            @AuthenticationPrincipal CustomUserDetails user,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(profileService.uploadCv(user.getId(), file));
    }

    @PostMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload profile picture — returns updated profile with avatar_url")
    public ResponseEntity<ProfileResponse> uploadAvatar(
            @AuthenticationPrincipal CustomUserDetails user,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(profileService.uploadAvatar(user.getId(), file));
    }

    @GetMapping
    @Operation(summary = "Directory search — supports q + optional specialty/country/city/promo range filters")
    public ResponseEntity<Page<ProfileResponse>> search(
            @RequestParam(value = "q", required = false, defaultValue = "") String q,
            @RequestParam(value = "specialty", required = false) String specialtyCode,
            @RequestParam(value = "country", required = false) String country,
            @RequestParam(value = "city", required = false) String city,
            @RequestParam(value = "promotionYearMin", required = false) Integer promotionYearMin,
            @RequestParam(value = "promotionYearMax", required = false) Integer promotionYearMax,
            Pageable pageable) {
        // If no filters, take the fast path. Otherwise route to the
        // multi-filter query (which also handles plain `q` correctly).
        boolean hasFilters = (specialtyCode != null && !specialtyCode.isBlank())
                || (country != null && !country.isBlank())
                || (city != null && !city.isBlank())
                || promotionYearMin != null
                || promotionYearMax != null;
        if (hasFilters) {
            return ResponseEntity.ok(profileService.searchFiltered(
                    q, specialtyCode, country, city,
                    promotionYearMin, promotionYearMax, pageable));
        }
        return ResponseEntity.ok(profileService.search(q, pageable));
    }
}
