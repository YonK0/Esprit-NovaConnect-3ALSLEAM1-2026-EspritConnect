package tn.esprit.connect.modules.verification.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Type-safe binding for the {@code verification:} block in application.yml.
 *
 * Kept as nested classes (not records) so Spring's relaxed binding still
 * works for kebab-case env vars and so we can mutate test fixtures freely.
 */
@Component
@ConfigurationProperties(prefix = "verification")
@Getter
@Setter
public class VerificationProperties {

    private boolean enabled = true;
    private Recruiter recruiter = new Recruiter();
    private Student student = new Student();
    private Files files = new Files();
    private Face face = new Face();
    private Python python = new Python();

    @Getter @Setter public static class Recruiter {
        private List<String> blockedEmailDomains = List.of();
    }

    @Getter @Setter public static class Student {
        private List<String> autoApproveDomains = List.of();
    }

    @Getter @Setter public static class Files {
        private long maxSizeBytes = 5L * 1024 * 1024;
        private List<String> allowedMimeTypes = List.of(
                "image/jpeg", "image/png", "image/webp", "application/pdf");
    }

    @Getter @Setter public static class Face {
        private int maxRetries = 3;
    }

    @Getter @Setter public static class Python {
        private String baseUrl = "http://verification-service:8000";
        private String sharedSecret = "dev_secret_change_me";
        private int timeoutSeconds = 60;
    }
}
