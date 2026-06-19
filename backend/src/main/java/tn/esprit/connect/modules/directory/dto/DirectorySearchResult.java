package tn.esprit.connect.modules.directory.dto;

import java.util.UUID;

public record DirectorySearchResult(
        UUID id,
        String firstName,
        String lastName,
        String headline,
        String specialtyCode,
        String city,
        String country,
        String avatarUrl
) {}
