package tn.esprit.connect.modules.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RequestEmailChangeRequest(
        @NotBlank @Email String newEmail) {
}
