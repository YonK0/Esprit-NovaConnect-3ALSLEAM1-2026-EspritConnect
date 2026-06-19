package tn.esprit.connect.modules.auth.dto;

import jakarta.validation.constraints.*;
import tn.esprit.connect.modules.user.entity.Role;
import java.util.List;

public record SignupRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank
        @Size(min = 8, max = 100)
        @Pattern(regexp = "^(?=.*[A-Z])(?=.*\\d).+$",
                 message = "Password must contain uppercase + digit")
        String password,
        @NotBlank @Size(max = 80) String firstName,
        @NotBlank @Size(max = 80) String lastName,
        @Size(max = 64) String country,
        List<Integer> promotionYears,
        @NotBlank @Size(max = 16) String specialtyCode,
        Role role
) {
    public Role roleOrDefault() {
        // ADMIN cannot be requested via public signup
        if (role == null || role == Role.ADMIN) return Role.STUDENT;
        return role;
    }
}
