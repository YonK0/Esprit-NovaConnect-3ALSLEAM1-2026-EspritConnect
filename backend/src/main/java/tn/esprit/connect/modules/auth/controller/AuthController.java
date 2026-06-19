package tn.esprit.connect.modules.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.auth.dto.AuthResponse;
import tn.esprit.connect.modules.auth.dto.ConfirmEmailChangeRequest;
import tn.esprit.connect.modules.auth.dto.ForgotPasswordRequest;
import tn.esprit.connect.modules.auth.dto.LoginRequest;
import tn.esprit.connect.modules.auth.dto.RefreshRequest;
import tn.esprit.connect.modules.auth.dto.RequestEmailChangeRequest;
import tn.esprit.connect.modules.auth.dto.ResetPasswordRequest;
import tn.esprit.connect.modules.auth.dto.SignupRequest;
import tn.esprit.connect.modules.auth.dto.VerifyEmailCodeRequest;
import tn.esprit.connect.modules.auth.dto.VerifyEmailResponse;
import tn.esprit.connect.modules.auth.service.AuthService;
import tn.esprit.connect.security.CustomUserDetails;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Signup, login, refresh, logout")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/signup")
    @Operation(summary = "Create a new account (PENDING admin approval)")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest req) {
        return ResponseEntity.status(201).body(authService.signup(req));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate and receive JWT tokens")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return ResponseEntity.ok(authService.login(req));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Rotate refresh token, receive new access + refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshRequest req) {
        return ResponseEntity.ok(authService.refresh(req));
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke all refresh tokens for the current user")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal CustomUserDetails user) {
        if (user != null) authService.logout(user.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/verify-email")
    @Operation(summary = "Confirm email address; returns identity-verification session id so the frontend can chain into Documents/Face steps")
    public ResponseEntity<VerifyEmailResponse> verifyEmail(@Valid @RequestBody VerifyEmailCodeRequest req) {
        return ResponseEntity.ok(authService.verifyEmailCode(req.email(), req.code()));
    }

    @PostMapping("/resend-verification")
    @Operation(summary = "Re-send a fresh 6-digit verification code by email")
    public ResponseEntity<Void> resendVerification(@RequestParam String email) {
        authService.resendVerification(email);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request a password reset link (sends email to user)")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        authService.requestPasswordReset(req.email());
        return ResponseEntity.ok(Map.of(
            "message", "Password reset link has been sent to your email. Please check your inbox."
        ));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Confirm password reset with token and new password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        authService.confirmPasswordReset(req.token(), req.newPassword());
        return ResponseEntity.ok(Map.of(
            "message", "Password has been reset successfully. Please log in with your new password."
        ));
    }

    @PostMapping("/request-email-change")
    @Operation(summary = "Request to change email. Sends verification code to new email address.")
    public ResponseEntity<Map<String, String>> requestEmailChange(
            @AuthenticationPrincipal CustomUserDetails user,
            @Valid @RequestBody RequestEmailChangeRequest req) {
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }
        authService.requestEmailChange(user.getId(), req.newEmail());
        return ResponseEntity.ok(Map.of(
            "message", "Verification code sent to your new email address. Please check your inbox."
        ));
    }

    @PostMapping("/confirm-email-change")
    @Operation(summary = "Confirm email change with verification code")
    public ResponseEntity<Map<String, String>> confirmEmailChange(
            @AuthenticationPrincipal CustomUserDetails user,
            @Valid @RequestBody ConfirmEmailChangeRequest req) {
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }
        authService.confirmEmailChange(user.getId(), req.code());
        return ResponseEntity.ok(Map.of(
            "message", "Email has been changed successfully."
        ));
    }
}
