package tn.esprit.connect.modules.verification.entity;

public enum VerificationOutcome {
    PASS,
    FAIL,
    RETRYABLE,         // verification failed but user still has attempts left
    SKIPPED            // e.g. @esprit.tn student short-circuits the flow
}
