package tn.esprit.connect.verification;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tn.esprit.connect.modules.user.entity.Role;
import tn.esprit.connect.modules.verification.config.VerificationProperties;
import tn.esprit.connect.modules.verification.service.EmailDomainValidator;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class EmailDomainValidatorTest {

    private EmailDomainValidator validator;

    @BeforeEach
    void setUp() {
        VerificationProperties props = new VerificationProperties();
        props.getRecruiter().setBlockedEmailDomains(List.of("gmail.com", "yahoo.com", "outlook.com"));
        props.getStudent().setAutoApproveDomains(List.of("esprit.tn"));
        validator = new EmailDomainValidator(props);
    }

    @Test
    void studentWithEspritEmail_isAutoApproved() {
        assertThat(validator.evaluate(Role.STUDENT, "ahmed@esprit.tn"))
                .isEqualTo(EmailDomainValidator.Result.STUDENT_AUTO_APPROVE);
    }

    @Test
    void studentWithGmail_proceedsToVerification() {
        assertThat(validator.evaluate(Role.STUDENT, "ahmed@gmail.com"))
                .isEqualTo(EmailDomainValidator.Result.PROCEED_TO_VERIFICATION);
    }

    @Test
    void recruiterWithPublicDomain_isRejected() {
        assertThat(validator.evaluate(Role.RECRUITER, "hr@gmail.com"))
                .isEqualTo(EmailDomainValidator.Result.RECRUITER_PUBLIC_DOMAIN_REJECTED);
        assertThat(validator.evaluate(Role.RECRUITER, "hr@YAHOO.com"))
                .isEqualTo(EmailDomainValidator.Result.RECRUITER_PUBLIC_DOMAIN_REJECTED);
    }

    @Test
    void recruiterWithCorporateDomain_proceeds() {
        assertThat(validator.evaluate(Role.RECRUITER, "talent@stripe.com"))
                .isEqualTo(EmailDomainValidator.Result.PROCEED_TO_VERIFICATION);
    }

    @Test
    void alumniAndMentorAlwaysProceed_regardlessOfDomain() {
        assertThat(validator.evaluate(Role.ALUMNI, "amal@gmail.com"))
                .isEqualTo(EmailDomainValidator.Result.PROCEED_TO_VERIFICATION);
        assertThat(validator.evaluate(Role.MENTOR, "omar@gmail.com"))
                .isEqualTo(EmailDomainValidator.Result.PROCEED_TO_VERIFICATION);
    }

    @Test
    void malformedEmail_returnsUnknown() {
        assertThat(validator.evaluate(Role.STUDENT, "no-at-sign"))
                .isEqualTo(EmailDomainValidator.Result.UNKNOWN);
        assertThat(validator.evaluate(Role.STUDENT, "trailing-at@"))
                .isEqualTo(EmailDomainValidator.Result.UNKNOWN);
        assertThat(validator.evaluate(Role.STUDENT, null))
                .isEqualTo(EmailDomainValidator.Result.UNKNOWN);
    }
}
