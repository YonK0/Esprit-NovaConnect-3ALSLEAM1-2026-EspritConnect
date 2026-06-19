package tn.esprit.connect.modules.verification.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
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
import tn.esprit.connect.modules.badge.service.BadgeService;
import tn.esprit.connect.modules.storage.StorageService;
import tn.esprit.connect.modules.verification.client.VerificationClient;
import tn.esprit.connect.modules.verification.config.VerificationProperties;
import tn.esprit.connect.modules.verification.dto.VerificationDtos.*;
import tn.esprit.connect.modules.verification.entity.VerificationAttempt;
import tn.esprit.connect.modules.verification.entity.VerificationOutcome;
import tn.esprit.connect.modules.verification.entity.VerificationStep;
import tn.esprit.connect.modules.verification.repository.VerificationAttemptRepository;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Drives the full signup-verification state machine.
 *
 * The verificationSessionId returned to the client IS the User UUID for
 * v1 — keeping a separate session id would force a join on every step
 * but gain us no real benefit because the user row already exists in
 * DRAFT status from init.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VerificationOrchestrator {

    private final BadgeService badgeService;
    private final StorageService storageService;
    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PromotionRepository promotionRepository;
    private final SpecialtyRepository specialtyRepository;
    private final VerificationAttemptRepository attemptRepository;
    private final VerificationClient verificationClient;
    private final EmailDomainValidator emailDomainValidator;
    private final VerificationProperties props;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper json = new ObjectMapper();

    // ============================================================
    // signup-init
    // ============================================================
    @Transactional
    public InitResponse init(InitRequest req) {
        if (userRepository.existsByEmailIgnoreCase(req.email())) {
            throw new BusinessException("Email already in use");
        }

        var emailDecision = emailDomainValidator.evaluate(req.role(), req.email());
        if (emailDecision == EmailDomainValidator.Result.RECRUITER_PUBLIC_DOMAIN_REJECTED) {
            throw new BusinessException(
                    "Recruiters must register with a corporate email — public domains (gmail, yahoo, ...) are not accepted.");
        }

        Specialty specialty = specialtyRepository.findByCode(req.specialtyCode())
                .orElseThrow(() -> new ResourceNotFoundException("Specialty", req.specialtyCode()));
        Promotion promotion = promotionRepository.findFirstByYear(req.promotionYear())
                .orElseGet(() -> promotionRepository.save(
                        Promotion.builder().year(req.promotionYear()).department("ESPRIT").build()));

        boolean skip = (emailDecision == EmailDomainValidator.Result.STUDENT_AUTO_APPROVE)
                || !props.isEnabled();

        User user = User.builder()
                .email(req.email().toLowerCase())
                .passwordHash(passwordEncoder.encode(req.password()))
                .role(req.role() == Role.ADMIN ? Role.STUDENT : req.role())   // never trust client ADMIN
                .status(skip ? UserStatus.PENDING_APPROVAL : UserStatus.DRAFT)
                .build();
        user = userRepository.save(user);

        profileRepository.save(Profile.builder()
                .user(user).firstName(req.firstName()).lastName(req.lastName())
                .promotion(promotion).specialty(specialty).searchable(true)
                .build());

        recordAttempt(user, VerificationStep.INIT,
                skip ? VerificationOutcome.SKIPPED : VerificationOutcome.PASS,
                null,
                skip ? "auto-approved by email domain" : "verification flow initiated",
                null, null, null, null);

        return new InitResponse(
                user.getId(),
                user.getEmail(),
                user.getStatus().name(),
                user.getId(),       // sessionId == userId
                skip,
                skip ? "Account created — pending admin approval. You can log in once approved."
                     : "Continue verification by uploading your documents."
        );
    }

    // ============================================================
    // verify-documents
    // ============================================================
    @Transactional
    public DocumentVerifyResult verifyDocuments(UUID sessionId,
                                                MultipartFile idFile,
                                                MultipartFile secondaryFile) {
        User user = userRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Verification session", sessionId));
        // Allow the signup flow (DRAFT / VERIFICATION_FAILED) and an already-
        // active member completing an admin-requested (or voluntary) identity
        // verification. The latter must keep their ACTIVE status untouched.
        boolean reVerify = isActiveReverify(user);
        if (user.getStatus() != UserStatus.DRAFT
                && user.getStatus() != UserStatus.VERIFICATION_FAILED
                && !reVerify) {
            throw new BusinessException(
                    "Document verification not allowed from status " + user.getStatus());
        }

        // Role-based requirement: ALUMNI/MENTOR/RECRUITER MUST provide a secondary doc
        if (requiresSecondaryDoc(user.getRole()) && (secondaryFile == null || secondaryFile.isEmpty())) {
            throw new BusinessException(
                    "Your role (" + user.getRole() + ") requires a secondary document (degree, certificate, or corporate proof).");
        }

        validateFile(idFile, "ID document");
        if (secondaryFile != null && !secondaryFile.isEmpty()) {
            validateFile(secondaryFile, "Secondary document");
        }

        Profile profile = profileRepository.findByUserId(user.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Profile", user.getId()));
        String declaredName = (profile.getFirstName() + " " + profile.getLastName()).trim();

        // Upload BEFORE forwarding so admins can review the exact bytes we
        // analysed, even when the Python service rejects with 4xx.
        String idKey = storageService.uploadVerificationFile(
                user.getId(), VerificationStep.DOCUMENTS.name() + "/id", idFile);
        String secondaryKey = (secondaryFile != null && !secondaryFile.isEmpty())
                ? storageService.uploadVerificationFile(
                        user.getId(), VerificationStep.DOCUMENTS.name() + "/secondary", secondaryFile)
                : null;

        JsonNode resp = verificationClient.verifyDocument(idFile, secondaryFile, declaredName);

        String nameOnId = resp.path("name_on_id").asText(null);
        String nameOnSecondary = resp.path("name_on_secondary").asText(null);
        boolean nameMatch = resp.path("name_match").asBoolean(false);
        double nameMatchScore = resp.path("name_match_score").asDouble(0.0);
        String idFaceB64 = resp.path("id_face_b64").asText(null);

        VerificationOutcome outcome = nameMatch ? VerificationOutcome.PASS : VerificationOutcome.FAIL;
        recordDocumentsAttempt(user, outcome, rawResponseToMap(resp),
                nameMatch ? null : "Name on ID does not match name on secondary document.",
                nameMatchScore, idKey, secondaryKey,
                nameOnId, nameOnSecondary);

        if (!nameMatch) {
            // Don't lock out an already-active member on a bad scan; just block
            // the verification and let them retry.
            if (!reVerify) user.setStatus(UserStatus.VERIFICATION_FAILED);
            throw new BusinessException(
                    "Name mismatch between documents (score " + nameMatchScore + "). Please upload clearer images.");
        }

        if (!reVerify) user.setStatus(UserStatus.VERIFYING);
        return new DocumentVerifyResult(
                user.getId(), nameOnId, nameOnSecondary, true, nameMatchScore, idFaceB64,
                "Documents OK. Continue with the face capture step."
        );
    }

    // ============================================================
    // verify-face
    // ============================================================
    @Transactional
    public FaceVerifyResult verifyFace(UUID sessionId,
                                        String idFaceB64,
                                        MultipartFile frame1,
                                        MultipartFile frame2,
                                        MultipartFile frame3) {
        User user = userRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Verification session", sessionId));
        boolean reVerify = isActiveReverify(user);
        if (user.getStatus() != UserStatus.VERIFYING
                && user.getStatus() != UserStatus.VERIFICATION_FAILED
                && !reVerify) {
            throw new BusinessException(
                    "Cannot run face verification from status " + user.getStatus());
        }

        validateFile(frame1, "Frame 1");
        validateFile(frame2, "Frame 2");
        validateFile(frame3, "Frame 3");

        long faceAttempts = attemptRepository.countByUserIdAndStep(user.getId(), VerificationStep.FACE);
        int attemptNumber = (int) faceAttempts + 1;
        // Face verification has unlimited retries — a non-matching attempt is
        // always retryable and never a hard failure that blocks the user.

        // Upload the 3 captured frames so admins can review what was scored.
        List<String> frameKeys = List.of(
                storageService.uploadVerificationFile(user.getId(),
                        VerificationStep.FACE.name() + "/" + attemptNumber + "/frame1", frame1),
                storageService.uploadVerificationFile(user.getId(),
                        VerificationStep.FACE.name() + "/" + attemptNumber + "/frame2", frame2),
                storageService.uploadVerificationFile(user.getId(),
                        VerificationStep.FACE.name() + "/" + attemptNumber + "/frame3", frame3)
        );

        JsonNode resp = verificationClient.verifyFace(idFaceB64, frame1, frame2, frame3);

        boolean faceMatch = resp.path("face_match").asBoolean(false);
        double similarity = resp.path("similarity").asDouble(0.0);
        int framesPassing = resp.path("frames_passing").asInt(0);
        boolean livenessPassed = resp.path("liveness_passed").asBoolean(false);
        List<String> reasons = new java.util.ArrayList<>();
        resp.path("reasons").forEach(n -> reasons.add(n.asText("")));

        boolean pass = faceMatch && livenessPassed;
        VerificationOutcome outcome;
        String verdict;
        // -1 signals "unlimited retries remaining" to the client.
        int attemptsRemaining = -1;

        if (pass) {
            outcome = VerificationOutcome.PASS;
            verdict = "PASS";
            // Signup flow → awaits admin approval. Re-verification of an
            // already-active member → keep them ACTIVE, just mark verified.
            if (!reVerify) user.setStatus(UserStatus.PENDING_APPROVAL);
            user.setVerifiedAt(Instant.now());
            user.setVerificationAttemptsCount(attemptNumber);
            // Identity verification flow completed successfully: flip the trust
            // badge on. For the signup flow we clear the (normally absent)
            // admin request; for an admin-requested re-verification we KEEP the
            // timestamp so the completed user stays visible in the admin
            // verifications queue until an admin acknowledges the chain.
            user.setIdentityVerified(true);
            if (!reVerify) user.setIdentityVerificationRequestedAt(null);
            badgeService.onVerificationPassed(user.getId());
            recordFaceAttempt(user, outcome, rawResponseToMap(resp),
                    null, similarity, livenessPassed, attemptNumber, frameKeys);
            recordAttempt(user, VerificationStep.DECISION, VerificationOutcome.PASS, null,
                    "Verification PASS — awaiting admin approval.",
                    null, similarity, livenessPassed, attemptNumber);
        } else {
            // Always retryable — there's no attempt cap.
            outcome = VerificationOutcome.RETRYABLE;
            verdict = "RETRYABLE";
            if (!reVerify) user.setStatus(UserStatus.VERIFICATION_FAILED);
            user.setVerificationAttemptsCount(attemptNumber);
            recordFaceAttempt(user, outcome, rawResponseToMap(resp),
                    String.join("; ", reasons), similarity, livenessPassed, attemptNumber, frameKeys);
        }

        return new FaceVerifyResult(
                user.getId(),
                faceMatch, similarity, framesPassing, livenessPassed,
                verdict,
                attemptsRemaining,
                reasons,
                verdictMessage(verdict, reasons)
        );
    }

    // ============================================================
    // status
    // ============================================================
    @Transactional(readOnly = true)
    public StatusResponse status(UUID sessionId) {
        User user = userRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Verification session", sessionId));
        List<VerificationAttempt> attempts = attemptRepository.findByUserIdOrderByCreatedAtAsc(user.getId());
        return new StatusResponse(
                user.getId(),
                user.getStatus().name(),
                attempts.size(),
                attempts.stream().map(a -> new AttemptSummary(
                        a.getStep().name(), a.getOutcome().name(),
                        a.getNameMatchScore(), a.getFaceMatchScore(), a.getLivenessPassed(),
                        a.getRejectionReason(),
                        a.getCompletedAt() == null ? null : a.getCompletedAt().toString())).toList()
        );
    }

    /**
     * Opt out of identity verification mid-flow. The user moves to
     * PENDING_APPROVAL so the admin queue sees them; identityVerified
     * stays false so the profile badge stays off until they (or an
     * admin-triggered request) complete the real flow later.
     *
     * Allowed from any pre-approval status so a user who already started
     * and bailed (DRAFT, VERIFYING, VERIFICATION_FAILED) can still skip.
     */
    @Transactional
    public void skipIdentity(UUID sessionId) {
        User user = userRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Verification session", sessionId));
        UserStatus s = user.getStatus();
        if (s != UserStatus.DRAFT
                && s != UserStatus.VERIFYING
                && s != UserStatus.VERIFICATION_FAILED) {
            throw new BusinessException(
                    "Cannot skip identity verification from status " + s);
        }
        user.setStatus(UserStatus.PENDING_APPROVAL);
        recordAttempt(user, VerificationStep.DECISION, VerificationOutcome.SKIPPED, null,
                "User opted to skip identity verification — awaiting admin approval.",
                null, null, null, null);
    }

    // ============================================================
    // helpers
    // ============================================================
    private boolean requiresSecondaryDoc(Role role) {
        return role == Role.ALUMNI || role == Role.MENTOR || role == Role.RECRUITER;
    }

    /**
     * True when an already-approved (ACTIVE) member is completing identity
     * verification — admin-requested or voluntary. In this case we run the
     * document/face checks but must NOT mutate their account status; only
     * {@code identityVerified} flips on success.
     */
    private boolean isActiveReverify(User user) {
        return user.getStatus() == UserStatus.ACTIVE && !user.isIdentityVerified();
    }

    private void validateFile(MultipartFile mf, String label) {
        if (mf == null || mf.isEmpty()) {
            throw new BusinessException(label + " is required.");
        }
        long max = props.getFiles().getMaxSizeBytes();
        if (mf.getSize() > max) {
            throw new BusinessException(label + " exceeds the " + (max / (1024 * 1024)) + "MB limit.");
        }
        String ct = mf.getContentType();
        if (ct == null || !props.getFiles().getAllowedMimeTypes().contains(ct)) {
            throw new BusinessException(label + " must be JPG, PNG, WEBP, or PDF (was: " + ct + ").");
        }
    }

    private void recordAttempt(User user,
                               VerificationStep step,
                               VerificationOutcome outcome,
                               Map<String, Object> raw,
                               String rejectionReason,
                               Double nameScore,
                               Double faceScore,
                               Boolean liveness,
                               Integer attemptNumber) {
        attemptRepository.save(VerificationAttempt.builder()
                .user(user)
                .step(step)
                .outcome(outcome)
                .nameMatchScore(nameScore)
                .faceMatchScore(faceScore)
                .livenessPassed(liveness)
                .rejectionReason(rejectionReason)
                .rawResponse(raw)
                .attemptNumber(attemptNumber == null ? 1 : attemptNumber)
                .completedAt(Instant.now())
                .build());
    }

    /** DOCUMENTS step with MinIO keys + extracted OCR names. */
    private void recordDocumentsAttempt(User user,
                                         VerificationOutcome outcome,
                                         Map<String, Object> raw,
                                         String rejectionReason,
                                         Double nameScore,
                                         String idKey,
                                         String secondaryKey,
                                         String extractedIdName,
                                         String extractedSecondaryName) {
        attemptRepository.save(VerificationAttempt.builder()
                .user(user)
                .step(VerificationStep.DOCUMENTS)
                .outcome(outcome)
                .nameMatchScore(nameScore)
                .idFileUrl(idKey)
                .secondaryFileUrl(secondaryKey)
                .extractedIdName(extractedIdName)
                .extractedSecondaryName(extractedSecondaryName)
                .rejectionReason(rejectionReason)
                .rawResponse(raw)
                .attemptNumber(1)
                .completedAt(Instant.now())
                .build());
    }

    /** FACE step with the 3 captured frame keys. */
    private void recordFaceAttempt(User user,
                                    VerificationOutcome outcome,
                                    Map<String, Object> raw,
                                    String rejectionReason,
                                    Double faceScore,
                                    Boolean liveness,
                                    Integer attemptNumber,
                                    List<String> frameKeys) {
        attemptRepository.save(VerificationAttempt.builder()
                .user(user)
                .step(VerificationStep.FACE)
                .outcome(outcome)
                .faceMatchScore(faceScore)
                .livenessPassed(liveness)
                .rejectionReason(rejectionReason)
                .rawResponse(raw)
                .frameKeys(frameKeys)
                .attemptNumber(attemptNumber == null ? 1 : attemptNumber)
                .completedAt(Instant.now())
                .build());
    }

    private Map<String, Object> rawResponseToMap(JsonNode node) {
        try {
            return json.convertValue(node, Map.class);
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    private static String verdictMessage(String verdict, List<String> reasons) {
        return switch (verdict) {
            case "PASS" -> "✅ Verification passed. Your account is pending admin approval.";
            case "RETRYABLE" -> "❌ " + String.join("; ", reasons) + " — please try again.";
            default -> "❌ Verification failed. " + String.join("; ", reasons) + " Contact support@espritconnect.tn.";
        };
    }
}
