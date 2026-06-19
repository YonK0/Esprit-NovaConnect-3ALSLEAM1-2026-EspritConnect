package tn.esprit.connect.modules.verification.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tn.esprit.connect.modules.verification.dto.VerificationDtos.*;
import tn.esprit.connect.modules.verification.service.VerificationOrchestrator;

import java.util.UUID;

/**
 * Public signup-verification endpoints.
 *
 * Under /api/v1/auth/signup so the SecurityConfig already permits them
 * without authentication — unverified users obviously can't have a JWT.
 */
@RestController
@RequestMapping("/api/v1/auth/signup")
@RequiredArgsConstructor
@Tag(name = "Auth · Verification")
public class VerificationController {

    private final VerificationOrchestrator orchestrator;

    @PostMapping("/init")
    @Operation(summary = "Start a signup-verification session.")
    public ResponseEntity<InitResponse> init(@Valid @RequestBody InitRequest req) {
        InitResponse resp = orchestrator.init(req);
        return ResponseEntity.status(201).body(resp);
    }

    @PostMapping(value = "/verify-documents", consumes = "multipart/form-data")
    @Operation(summary = "Upload ID + optional secondary document for OCR + name match.")
    public ResponseEntity<DocumentVerifyResult> verifyDocuments(
            @RequestParam("verificationSessionId") UUID sessionId,
            @RequestPart("idFile") MultipartFile idFile,
            @RequestPart(value = "secondaryFile", required = false) MultipartFile secondaryFile
    ) {
        return ResponseEntity.ok(orchestrator.verifyDocuments(sessionId, idFile, secondaryFile));
    }

    @PostMapping(value = "/verify-face", consumes = "multipart/form-data")
    @Operation(summary = "Submit 3 live frames; compare to the ID face + liveness check.")
    public ResponseEntity<FaceVerifyResult> verifyFace(
            @RequestParam("verificationSessionId") UUID sessionId,
            @RequestParam("idFaceB64") String idFaceB64,
            @RequestPart("frame1") MultipartFile frame1,
            @RequestPart("frame2") MultipartFile frame2,
            @RequestPart("frame3") MultipartFile frame3
    ) {
        return ResponseEntity.ok(
                orchestrator.verifyFace(sessionId, idFaceB64, frame1, frame2, frame3));
    }

    @GetMapping("/status/{sessionId}")
    @Operation(summary = "Current status + attempt history for a verification session.")
    public ResponseEntity<StatusResponse> status(@PathVariable UUID sessionId) {
        return ResponseEntity.ok(orchestrator.status(sessionId));
    }

    /**
     * Opt out of identity verification — moves the user from DRAFT (or
     * VERIFYING / VERIFICATION_FAILED) to PENDING_APPROVAL so the admin
     * queue sees them. The user keeps {@code identityVerified=false};
     * an admin can request real verification later.
     */
    @PostMapping("/skip-identity/{sessionId}")
    @Operation(summary = "Skip identity verification; user moves to PENDING_APPROVAL.")
    public ResponseEntity<Void> skipIdentity(@PathVariable UUID sessionId) {
        orchestrator.skipIdentity(sessionId);
        return ResponseEntity.noContent().build();
    }
}
