package tn.esprit.connect.modules.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.auth.dto.AuthResponse;
import tn.esprit.connect.modules.auth.dto.LoginRequest;
import tn.esprit.connect.modules.auth.dto.RefreshRequest;
import tn.esprit.connect.modules.auth.dto.SignupRequest;
import tn.esprit.connect.modules.auth.dto.VerifyEmailResponse;
import tn.esprit.connect.modules.verification.config.VerificationProperties;
import tn.esprit.connect.modules.auth.entity.RefreshToken;
import tn.esprit.connect.modules.auth.repository.RefreshTokenRepository;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.entity.Promotion;
import tn.esprit.connect.modules.profile.entity.Specialty;
import tn.esprit.connect.modules.profile.repository.ProfileRepository;
import tn.esprit.connect.modules.profile.repository.PromotionRepository;
import tn.esprit.connect.modules.profile.repository.SpecialtyRepository;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.entity.UserStatus;
import tn.esprit.connect.modules.user.repository.UserRepository;
import tn.esprit.connect.security.JwtTokenProvider;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PromotionRepository promotionRepository;
    private final SpecialtyRepository specialtyRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final AuthenticationManager authenticationManager;
    private final MailService mailService;
    private final VerificationProperties verificationProperties;

    private static final SecureRandom OTP_RNG = new SecureRandom();

    /** Six-digit zero-padded code. Cryptographically random so it can't be guessed in 24h. */
    private static String generateOtp() {
        return String.format("%06d", OTP_RNG.nextInt(1_000_000));
    }

    @Transactional
    public AuthResponse signup(SignupRequest req) {
        if (userRepository.existsByEmailIgnoreCase(req.email())) {
            throw new BusinessException("Email already in use");
        }

        Specialty specialty = specialtyRepository.findByCode(req.specialtyCode())
                .orElseThrow(() -> new ResourceNotFoundException("Specialty", req.specialtyCode()));

        Promotion promotion = promotionRepository.findFirstByYear(req.promotionYears() != null && !req.promotionYears().isEmpty() ? req.promotionYears().get(0) : 2026)
                .orElseGet(() -> promotionRepository.save(
                        Promotion.builder().year(req.promotionYears() != null && !req.promotionYears().isEmpty() ? req.promotionYears().get(0) : 2026).department("ESPRIT").build()));

        User user = User.builder()
                .email(req.email().toLowerCase())
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(req.roleOrDefault())
                .status(UserStatus.PENDING)
                .build();
        user = userRepository.save(user);

        Profile profile = Profile.builder()
                .user(user)
                .firstName(req.firstName())
                .lastName(req.lastName())
                .country(req.country())
                .promotion(promotion)
                .specialty(specialty)
                .searchable(true)
                .build();
        profileRepository.save(profile);

        String code = generateOtp();
        user.setEvToken(code);
        user.setEvTokenExpiresAt(Instant.now().plusSeconds(24 * 3600));
        mailService.sendVerificationEmail(user.getEmail(), code);
        log.info("Signup completed for {} (PENDING approval, verification code emailed)", user.getEmail());
        return new AuthResponse(user.getId(), user.getEmail(), user.getRole().name(),
                user.getStatus().name(), null, null);
    }

    @Transactional
    public AuthResponse login(LoginRequest req) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.email(), req.password()));
        } catch (BadCredentialsException e) {
            throw new BadCredentialsException("Invalid email or password");
        }

        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new ResourceNotFoundException("User", req.email()));

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException("Account is not active (status=" + user.getStatus() + ")");
        }
        if (!user.isEmailVerified()) {
            // Block login until the verification link has been clicked.
            // The frontend recognises this exact prefix to render a
            // "Resend verification email" action next to the error.
            throw new BusinessException(
                "EMAIL_NOT_VERIFIED:Please verify your email address before logging in. " +
                "Check your inbox for the verification link or request a new one.");
        }

        user.setLastLoginAt(Instant.now());

        String access = tokenProvider.generateAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String refresh = tokenProvider.generateRefreshToken(user.getId());

        persistRefresh(user, refresh);

        return new AuthResponse(user.getId(), user.getEmail(), user.getRole().name(),
                user.getStatus().name(), access, refresh);
    }

    @Transactional
    public AuthResponse refresh(RefreshRequest req) {
        if (!tokenProvider.isValid(req.refreshToken())) {
            throw new BusinessException("Invalid refresh token");
        }
        var claims = tokenProvider.parse(req.refreshToken());
        if (!"refresh".equals(claims.get("type"))) {
            throw new BusinessException("Not a refresh token");
        }

        String hash = sha256(req.refreshToken());
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new BusinessException("Refresh token not recognized"));

        if (stored.isRevoked() || stored.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("Refresh token expired or revoked");
        }

        UUID userId = UUID.fromString(claims.getSubject());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        // rotate
        stored.setRevoked(true);

        String access = tokenProvider.generateAccessToken(user.getId(), user.getEmail(), user.getRole().name());
        String refresh = tokenProvider.generateRefreshToken(user.getId());
        persistRefresh(user, refresh);

        return new AuthResponse(user.getId(), user.getEmail(), user.getRole().name(),
                user.getStatus().name(), access, refresh);
    }

    @Transactional
    public void logout(UUID userId) {
        refreshTokenRepository.revokeAllForUser(userId);
    }

    /** Verify the 6-digit code emailed at signup (or via /resend-verification).
     *  Email + code must match a non-expired record. Code is single-use:
     *  cleared on success so it can't be replayed.
     *
     *  After consolidating the verified-signup flow into the normal signup
     *  path: on success the user is moved from {@code PENDING} to
     *  {@code DRAFT} so the identity-verification orchestrator
     *  ({@code verifyDocuments}/{@code verifyFace}) will accept the next
     *  calls. If verification is disabled on this install we leave the
     *  user at {@code PENDING_APPROVAL} and let the admin moderation queue
     *  handle them — the response signals this via {@code requiresVerification=false}. */
    @Transactional
    public VerifyEmailResponse verifyEmailCode(String email, String code) {
        if (email == null || email.isBlank() || code == null || code.isBlank()) {
            throw new BusinessException("Email and code are required.");
        }
        User user = userRepository.findByEmail(email.toLowerCase())
                .orElseThrow(() -> new BusinessException("Invalid email or code."));
        if (user.isEmailVerified()) {
            throw new BusinessException("Email already verified.");
        }
        if (user.getEvToken() == null || user.getEvTokenExpiresAt() == null) {
            throw new BusinessException("No verification code is pending for this account. Request a new one.");
        }
        if (user.getEvTokenExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("Verification code has expired. Please request a new one.");
        }
        // Constant-time compare so an attacker can't time-side-channel the code.
        if (!MessageDigest.isEqual(
                user.getEvToken().getBytes(),
                code.trim().getBytes())) {
            throw new BusinessException("Invalid verification code.");
        }
        user.setEmailVerified(true);
        user.setEvToken(null);
        user.setEvTokenExpiresAt(null);

        boolean kycRequired = verificationProperties.isEnabled();
        if (kycRequired) {
            // Hand off to the identity-verification orchestrator. DRAFT is the
            // status that allows verifyDocuments() — see VerificationOrchestrator#mustBeDraft.
            user.setStatus(UserStatus.DRAFT);
        } else {
            user.setStatus(UserStatus.PENDING_APPROVAL);
        }
        log.info("Email verified via OTP for {} (next status={}, KYC required={})",
                user.getEmail(), user.getStatus(), kycRequired);
        return new VerifyEmailResponse(user.getId(), user.getStatus().name(), kycRequired);
    }

    @Transactional
    public void resendVerification(String email) {
        User user = userRepository.findByEmail(email.toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("User", email));
        if (user.isEmailVerified()) {
            throw new BusinessException("Email already verified.");
        }
        String code = generateOtp();
        user.setEvToken(code);
        user.setEvTokenExpiresAt(Instant.now().plusSeconds(24 * 3600));
        mailService.sendVerificationEmail(user.getEmail(), code);
    }

    /**
     * User forgot their password. Generate a fresh reset token and email it.
     * The token is a UUID with a 2-hour expiry window.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        User user = userRepository.findByEmail(email.toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("User", email));
        
        String token = UUID.randomUUID().toString();
        user.setPwdResetToken(token);
        user.setPwdResetExpiresAt(Instant.now().plusSeconds(2 * 3600));   // 2h window
        userRepository.save(user);
        
        mailService.sendPasswordReset(user.getEmail(), token);
        log.info("Password reset requested for {}", user.getEmail());
    }

    /**
     * Confirm password reset using the token sent via email.
     * Token must be valid and not expired. Password is updated and token cleared.
     */
    @Transactional
    public void confirmPasswordReset(String token, String newPassword) {
        if (token == null || token.isBlank()) {
            throw new BusinessException("Reset token is required.");
        }
        if (newPassword == null || newPassword.isBlank()) {
            throw new BusinessException("New password is required.");
        }
        
        User user = userRepository.findByPwdResetToken(token)
                .orElseThrow(() -> new BusinessException("Invalid or expired reset token."));
        
        if (user.getPwdResetExpiresAt() == null || user.getPwdResetExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("Password reset token has expired. Please request a new one.");
        }
        
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setPwdResetToken(null);
        user.setPwdResetExpiresAt(null);
        userRepository.save(user);
        
        log.info("Password reset completed for {}", user.getEmail());
    }

    private void persistRefresh(User user, String refresh) {
        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .tokenHash(sha256(refresh))
                .expiresAt(Instant.now().plusSeconds(tokenProvider.getRefreshTtlSeconds()))
                .revoked(false)
                .build());
    }

    /**
     * Request email change. New email must not already exist in the database.
     * A 6-digit verification code is generated and sent to the new email.
     * The new email is stored as pending until verified.
     */
    @Transactional
    public void requestEmailChange(UUID userId, String newEmail) {
        if (newEmail == null || newEmail.isBlank()) {
            throw new BusinessException("New email is required.");
        }
        
        newEmail = newEmail.toLowerCase();
        
        if (userRepository.existsByEmailIgnoreCase(newEmail)) {
            throw new BusinessException("Email already in use. Please choose a different email address.");
        }
        
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        
        String code = generateOtp();
        user.setPendingNewEmail(newEmail);
        user.setEvToken(code);
        user.setEvTokenExpiresAt(Instant.now().plusSeconds(24 * 3600));
        userRepository.save(user);
        
        mailService.sendVerificationEmail(newEmail, code);
        log.info("Email change requested for user {} to new email {}", user.getEmail(), newEmail);
    }

    /**
     * Confirm email change. The code must match and not be expired.
     * On success, the pending new email becomes the current email.
     */
    @Transactional
    public void confirmEmailChange(UUID userId, String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException("Verification code is required.");
        }
        
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        
        if (user.getPendingNewEmail() == null) {
            throw new BusinessException("No pending email change request.");
        }
        
        if (user.getEvToken() == null || user.getEvTokenExpiresAt() == null) {
            throw new BusinessException("No verification code is pending.");
        }
        
        if (user.getEvTokenExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("Verification code has expired. Please request a new one.");
        }
        
        // Constant-time compare
        if (!MessageDigest.isEqual(
                user.getEvToken().getBytes(),
                code.trim().getBytes())) {
            throw new BusinessException("Invalid verification code.");
        }
        
        // Confirm: update email and clear pending state
        user.setEmail(user.getPendingNewEmail());
        user.setPendingNewEmail(null);
        user.setEvToken(null);
        user.setEvTokenExpiresAt(null);
        userRepository.save(user);
        
        log.info("Email changed for user {}", user.getId());
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(input.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

