package tn.esprit.connect.modules.user.entity;

/**
 * Account lifecycle, including the verification flow added in Phase 1.
 *
 * Path through the states:
 *   DRAFT → VERIFYING → PENDING_APPROVAL → ACTIVE
 *                    ↘ VERIFICATION_FAILED (retryable up to N times)
 *   PENDING is kept for backward compat with the original signup flow
 *   (treated as equivalent to PENDING_APPROVAL by the admin moderation queue).
 */
public enum UserStatus {
    DRAFT,                  // signup initiated, awaiting verification
    VERIFYING,              // documents uploaded, face capture pending
    VERIFICATION_FAILED,    // last attempt failed; retries allowed up to max
    PENDING,                // legacy: pre-Phase-1 signups awaiting admin approval
    PENDING_APPROVAL,       // verification passed, awaiting admin approval
    ACTIVE,
    SUSPENDED,
    DELETED
}
