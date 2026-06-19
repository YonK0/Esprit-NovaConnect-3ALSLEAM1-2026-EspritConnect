package tn.esprit.connect.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ConfirmEmailChangeRequest(
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Code must be 6 digits") String code) {
}
