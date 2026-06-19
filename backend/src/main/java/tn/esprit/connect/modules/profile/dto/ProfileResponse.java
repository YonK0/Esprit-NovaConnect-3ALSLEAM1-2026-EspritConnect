package tn.esprit.connect.modules.profile.dto;

import java.util.UUID;

public record ProfileResponse(
        UUID id,
        UUID userId,
        String firstName,
        String lastName,
        String headline,
        String bio,
        String avatarUrl,
        String cvUrl,
        String websiteUrl,
        String country,
        String city,
        String phone,
        boolean searchable,
        Integer promotionYear,
        String specialtyCode,
        String specialtyName,
        boolean openToWork,
        boolean identityVerified
) {}
