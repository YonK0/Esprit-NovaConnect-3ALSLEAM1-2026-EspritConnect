package tn.esprit.connect.modules.auth.dto;

import java.util.UUID;

/**
 * Returned by {@code POST /auth/verify-email} so the frontend can pick up
 * the identity-verification session id (== user id) and immediately
 * continue into the Documents → Face → Result wizard inline.
 *
 * Prior to consolidating the verified-signup flow into the normal signup
 * path, verify-email just returned 204 No Content; the dedicated
 * {@code /signup/wizard} route held both the email-verify step and the
 * KYC steps. Now that the wizard is gone, this small DTO is what lets
 * the email-verify screen pivot straight into document upload.
 *
 * @param sessionId verification session id; same UUID as the user id —
 *                  keeps the orchestrator's "sessionId == userId"
 *                  convention consistent for both the legacy
 *                  {@code /signup/init} and the new normal-signup flow.
 * @param status    user status AFTER the transition triggered by the OTP
 *                  acceptance — typically {@code DRAFT} so the verify-
 *                  documents endpoint will accept the next call.
 * @param requiresVerification {@code false} when the install has
 *                  verification disabled (dev / staging without the
 *                  Python service) — frontend then skips KYC and tells
 *                  the user they're awaiting admin approval.
 */
public record VerifyEmailResponse(UUID sessionId,
                                  String status,
                                  boolean requiresVerification) {}
