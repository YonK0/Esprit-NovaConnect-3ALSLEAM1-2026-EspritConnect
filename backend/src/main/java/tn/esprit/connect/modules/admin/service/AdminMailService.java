package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.modules.admin.dto.AdminDtos.BulkMailResponse;
import tn.esprit.connect.modules.auth.service.MailService;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Resolves a built-in mailing list to a list of email addresses, then
 * hands it to {@link MailService#sendBulkBcc} for a single BCC send.
 *
 * The list set is hard-coded for now ({@link #VALID_LISTS}); switching to
 * admin-defined segments is a future feature and would mean adding a
 * {@code mailing_lists} table plus a CRUD endpoint. For the initial use
 * case (broadcast to a role group), enumeration is enough and avoids the
 * implicit-tags problem of free-text segments.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminMailService {

    /** Allowed values for {@code BulkMailRequest.list}; case-insensitive. */
    public static final Set<String> VALID_LISTS = Set.of(
            "STUDENT", "ALUMNI", "MENTOR", "RECRUITER", "ADMIN", "ALL");

    private final JdbcTemplate jdbc;
    private final MailService mailService;
    private final AdminService adminService;

    @Transactional(readOnly = false)
    public BulkMailResponse send(UUID adminId, String list,
                                  String subject, String bodyHtml) {
        if (subject == null || subject.isBlank()) {
            throw new IllegalArgumentException("Subject is required");
        }
        if (bodyHtml == null || bodyHtml.isBlank()) {
            throw new IllegalArgumentException("Body is required");
        }
        String normalized = list == null ? "" : list.trim().toUpperCase();
        if (!VALID_LISTS.contains(normalized)) {
            throw new IllegalArgumentException("Unknown list: " + list
                    + " — must be one of " + VALID_LISTS);
        }

        List<String> emails = resolveEmails(normalized);
        log.info("Bulk-mail resolved list={} → {} recipient(s) (admin={})",
                normalized, emails.size(), adminId);

        int sent = mailService.sendBulkBcc(emails, subject, bodyHtml);

        // Audit trail entry — recorded even on partial / zero-recipient
        // sends so an admin can later answer "did we email anyone about X?".
        adminService.log(adminId, "BULK_EMAIL_SENT", Map.of(
                "list", normalized,
                "subject", subject,
                "recipientCount", sent));

        return new BulkMailResponse(normalized, sent, true);
    }

    /**
     * Returns the email addresses that should receive a broadcast to the
     * given normalized list code. Only counts <b>ACTIVE</b> users so we
     * don't email suspended / pending accounts. "ALL" is everyone ACTIVE
     * regardless of role; the role-specific lists narrow further.
     */
    private List<String> resolveEmails(String list) {
        if ("ALL".equals(list)) {
            return jdbc.queryForList("""
                    select email from users
                     where deleted_at is null
                       and status::text = 'ACTIVE'
                     order by email
                    """, String.class);
        }
        return jdbc.queryForList("""
                select email from users
                 where deleted_at is null
                   and status::text = 'ACTIVE'
                   and role::text   = ?
                 order by email
                """, String.class, list);
    }
}
