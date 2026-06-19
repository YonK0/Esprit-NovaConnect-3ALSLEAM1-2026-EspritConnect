package tn.esprit.connect.modules.profile.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.profile.dto.ProfileResponse;
import tn.esprit.connect.modules.profile.dto.UpdateProfileRequest;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.mapper.ProfileMapper;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final ProfileRepository profileRepository;
    private final UserRepository userRepository;
    private final ProfileMapper profileMapper;
    private final StorageService storageService;
    private final tn.esprit.connect.modules.badge.service.BadgeService badgeService;

    @Transactional(readOnly = true)
    public ProfileResponse getByUserId(UUID userId) {
        return profileMapper.toResponse(profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile for user", userId)));
    }

    @Transactional(readOnly = true)
    public ProfileResponse getById(UUID id) {
        return profileMapper.toResponse(profileRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Profile", id)));
    }

    @Transactional(readOnly = true)
    public Page<ProfileResponse> search(String query, Pageable pageable) {
        String q = query == null ? "" : query.trim();
        return profileRepository.search(q, pageable).map(profileMapper::toResponse);
    }

    /** Filtered search — every filter is optional; null/blank means "any". */
    @Transactional(readOnly = true)
    public Page<ProfileResponse> searchFiltered(String query, String specialtyCode,
                                                 String country, String city,
                                                 Integer promotionYearMin,
                                                 Integer promotionYearMax,
                                                 Pageable pageable) {
        String q = query == null ? "" : query.trim();
        return profileRepository.searchFiltered(q,
                blankToNull(specialtyCode), blankToNull(country), blankToNull(city),
                promotionYearMin, promotionYearMax, pageable)
                .map(profileMapper::toResponse);
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    @Transactional
    public ProfileResponse update(UUID userId, UpdateProfileRequest req) {
        Profile p = profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile for user", userId));

        if (req.firstName() != null) p.setFirstName(req.firstName());
        if (req.lastName() != null) p.setLastName(req.lastName());
        if (req.headline() != null) p.setHeadline(req.headline());
        if (req.bio() != null) p.setBio(req.bio());
        if (req.avatarUrl() != null) p.setAvatarUrl(req.avatarUrl());
        if (req.country() != null) p.setCountry(req.country());
        if (req.city() != null) p.setCity(req.city());
        if (req.searchable() != null) p.setSearchable(req.searchable());
        if (req.websiteUrl() != null) p.setWebsiteUrl(req.websiteUrl());

        Profile saved = profileRepository.save(p);

        // Update openToWork in the User entity
        if (req.openToWork() != null) {
            var user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", userId));
            user.setOpenToWork(req.openToWork());
            userRepository.save(user);
        }

        // Re-evaluate the COMPLETE_PROFILE badge — bio/headline edits move the needle.
        badgeService.maybeAwardCompleteProfile(userId);
        return profileMapper.toResponse(saved);
    }

    @Transactional
    public ProfileResponse uploadCv(UUID userId, MultipartFile file) {
        String ct = file.getContentType();
        if (ct == null || (!ct.equals("application/pdf")
                && !ct.startsWith("application/msword")
                && !ct.contains("officedocument"))) {
            throw new BusinessException("CV must be a PDF or Word document.");
        }
        if (file.getSize() > 10 * 1024 * 1024) {
            throw new BusinessException("CV file must not exceed 10 MB.");
        }
        Profile p = profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile for user", userId));
        String url = storageService.uploadProfileFile(userId, "cv", file);
        p.setCvUrl(url);
        return profileMapper.toResponse(p);
    }

    /** Upload a profile picture (avatar). Same `profiles` bucket as CVs
     *  but under the `avatar` category. Returns the updated profile with
     *  the presigned avatarUrl that the frontend can render directly. */
    @Transactional
    public ProfileResponse uploadAvatar(UUID userId, MultipartFile file) {
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) {
            throw new BusinessException("Avatar must be an image (JPEG / PNG / WEBP / GIF).");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new BusinessException("Avatar must not exceed 5 MB.");
        }
        Profile p = profileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile for user", userId));
        String url = storageService.uploadProfileFile(userId, "avatar", file);
        p.setAvatarUrl(url);
        // Avatar is one of the COMPLETE_PROFILE prerequisites.
        badgeService.maybeAwardCompleteProfile(userId);
        return profileMapper.toResponse(p);
    }
}
