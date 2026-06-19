package tn.esprit.connect.modules.profile.dto;

import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(max = 80) String firstName,
        @Size(max = 80) String lastName,
        @Size(max = 160) String headline,
        @Size(max = 2000) String bio,
        @Size(max = 512) String avatarUrl,
        @Size(max = 64) String country,
        @Size(max = 80) String city,
        @Size(max = 20) String phone,
        Boolean searchable,
        @Size(max = 512) String websiteUrl,
        Boolean openToWork
) {}
