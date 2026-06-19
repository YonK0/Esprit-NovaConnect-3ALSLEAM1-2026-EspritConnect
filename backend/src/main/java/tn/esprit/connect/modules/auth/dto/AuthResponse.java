package tn.esprit.connect.modules.auth.dto;

import java.util.UUID;

public record AuthResponse(
        UUID userId,
        String email,
        String role,
        String status,
        String accessToken,
        String refreshToken
) {}
