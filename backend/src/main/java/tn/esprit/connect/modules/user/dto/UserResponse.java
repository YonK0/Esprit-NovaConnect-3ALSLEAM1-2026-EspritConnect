package tn.esprit.connect.modules.user.dto;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String role,
        String status,
        Instant lastLoginAt,
        Instant createdAt,
        boolean identityVerified,
        /** Non-null when an admin has requested identity verification. Drives the in-app banner. */
        Instant identityVerificationRequestedAt
) {}
