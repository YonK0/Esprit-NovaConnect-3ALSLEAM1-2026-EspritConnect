package tn.esprit.connect.modules.verification.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.verification.config.VerificationProperties;

import java.util.Locale;

/**
 * Enforces the email rules described in the brief:
 * - STUDENT with @esprit.tn → short-circuit, skip verification
 * - RECRUITER with a public webmail domain → reject at signup-init
 *
 * Returns intent so {@link VerificationOrchestrator} can decide what to do
 * with it instead of throwing — that keeps the controller layer thin.
 */
@Component
@RequiredArgsConstructor
public class EmailDomainValidator {

    private final VerificationProperties props;

    public Result evaluate(Role role, String email) {
        if (email == null) return Result.UNKNOWN;
        String domain = domainOf(email);
        if (domain == null) return Result.UNKNOWN;

        if (role == Role.STUDENT && props.getStudent().getAutoApproveDomains()
                .stream().anyMatch(d -> d.equalsIgnoreCase(domain))) {
            return Result.STUDENT_AUTO_APPROVE;
        }

        if (role == Role.RECRUITER && props.getRecruiter().getBlockedEmailDomains()
                .stream().anyMatch(d -> d.equalsIgnoreCase(domain))) {
            return Result.RECRUITER_PUBLIC_DOMAIN_REJECTED;
        }

        return Result.PROCEED_TO_VERIFICATION;
    }

    private static String domainOf(String email) {
        int at = email.lastIndexOf('@');
        if (at < 0 || at == email.length() - 1) return null;
        return email.substring(at + 1).trim().toLowerCase(Locale.ROOT);
    }

    public enum Result {
        STUDENT_AUTO_APPROVE,
        RECRUITER_PUBLIC_DOMAIN_REJECTED,
        PROCEED_TO_VERIFICATION,
        UNKNOWN
    }
}
