package tn.esprit.connect.modules.verification.entity;

public enum VerificationStep {
    INIT,           // signup-init: email + role validated
    DOCUMENTS,      // /verify/document call
    FACE,           // /verify/face call
    DECISION        // final verdict written
}
