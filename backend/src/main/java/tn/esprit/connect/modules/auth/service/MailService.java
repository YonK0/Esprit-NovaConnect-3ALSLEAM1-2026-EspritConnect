package tn.esprit.connect.modules.auth.service;

import jakarta.activation.DataSource;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.util.ByteArrayDataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * Sends transactional emails via Spring's JavaMailSender. Default config
 * is Gmail SMTP (smtp.gmail.com:587) using a 16-char Gmail App Password —
 * see .env.example. Provider-agnostic at the code level: any STARTTLS:587
 * SMTP host (Brevo, SES, Mailtrap, etc.) works by overriding the MAIL_*
 * env vars without changing this class.
 *
 * Gmail specifics: 2-Step Verification must be ON for the account, and the
 * password must be an App Password — your normal Gmail password will be
 * rejected with "535-5.7.8 Username and Password not accepted". Gmail also
 * rewrites the From header to the authenticated user, so MAIL_FROM should
 * equal MAIL_USERNAME (or an alias on the same account).
 *
 * Graceful fallback: when MAIL_USERNAME is blank (no SMTP configured), we
 * skip the network call and log the email content to the backend console
 * instead. Dev environments and tests rely on this — signup still works
 * without an SMTP account, the verification link just shows up in
 * `docker logs espritconnect-api` for a human to copy.
 *
 * Every method swallows MailException — a failed email must never break
 * the calling business operation (signup, admin approve, etc.). Failures
 * are logged so an operator can re-trigger via the resend endpoints.
 */
@Slf4j
@Service
public class MailService {

    private final JavaMailSender sender;
    private final String fromAddress;
    private final String fromName;
    private final boolean smtpConfigured;
    private final String baseUrl;

    public MailService(JavaMailSender sender,
                       @Value("${spring.mail.username:}") String mailUsername,
                       @Value("${app.mail.from:no-reply@espritconnect.local}") String fromAddress,
                       @Value("${app.mail.from-name:EspritConnect}") String fromName,
                       @Value("${app.base-url:http://localhost:4200}") String baseUrl) {
        this.sender = sender;
        // Gmail rewrites the From header to the authenticated account — using
        // the username as From is the most reliable choice. We respect an
        // explicit override but otherwise fall back to the username.
        this.fromAddress = (fromAddress == null || fromAddress.isBlank()
                            || fromAddress.endsWith("@espritconnect.local"))
                ? (mailUsername.isBlank() ? "no-reply@espritconnect.local" : mailUsername)
                : fromAddress;
        this.fromName = fromName;
        this.smtpConfigured = mailUsername != null && !mailUsername.isBlank();
        this.baseUrl = baseUrl;

        if (smtpConfigured) {
            log.info("MailService: SMTP enabled, sending from {} <{}>", fromName, this.fromAddress);
        } else {
            log.warn("MailService: SMTP not configured (MAIL_USERNAME blank) — emails will be logged to console only.");
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    /** Synchronous test send — returns null on success, the SMTP error
     *  message on failure. Used by the admin /mail/test endpoint to probe
     *  SMTP credentials without going through the signup flow.
     *  Unlike the other send methods, this DOES NOT swallow exceptions —
     *  the caller wants the diagnostic. */
    /**
     * Bulk send via a single MimeMessage with all recipients in BCC. One
     * SMTP round-trip regardless of list size, so it stays fast on large
     * mailing lists, and recipients can't see each other's addresses
     * (they all see the From header in To: instead, which is the only
     * thing in the To: header here).
     *
     * Returns the number of recipients actually accepted by the SMTP
     * server; throws when the send fails entirely so the caller can
     * surface a 502 / "delivery failed" to the admin. We don't swallow
     * the exception here like the other helpers do — bulk mail is an
     * admin-triggered action, not a side effect of a business flow, so
     * silent failure would be confusing.
     */
    public int sendBulkBcc(java.util.List<String> recipients,
                            String subject, String bodyHtml) {
        if (recipients == null || recipients.isEmpty()) return 0;

        // De-duplicate and drop obviously-bad entries before hitting SMTP.
        java.util.LinkedHashSet<String> clean = new java.util.LinkedHashSet<>();
        for (String r : recipients) {
            if (r != null && r.contains("@") && !r.isBlank()) {
                clean.add(r.trim());
            }
        }
        if (clean.isEmpty()) return 0;

        if (!smtpConfigured) {
            log.info("[DEV] Would BCC-send subject '{}' to {} recipient(s)",
                    subject, clean.size());
            return clean.size();
        }

        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
            try {
                helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            } catch (UnsupportedEncodingException e) {
                helper.setFrom(fromAddress);
            }
            // The To: header is a single visible address (the sender). All
            // real recipients go into Bcc: so they remain hidden from each
            // other — this is the only safe pattern for cross-user mass mail.
            helper.setTo(fromAddress);
            helper.setBcc(clean.toArray(String[]::new));
            helper.setSubject(subject);

            // Render the admin's plain-text/HTML body inside the same
            // template the transactional emails use, so it visually matches
            // the rest of the network's mail. We don't escape the body
            // because the admin is trusted; they may include their own HTML.
            String html = template(
                    subject,                       // headline = subject
                    bodyHtml,                      // body passes through (admin-authored)
                    null, null,
                    "Sent from EspritConnect — you received this because you're a member of the network.");
            helper.setText(stripHtml(bodyHtml), html);
            sender.send(msg);
            log.info("Bulk email sent — subject: '{}', BCC count: {}", subject, clean.size());
            return clean.size();
        } catch (MailException | MessagingException e) {
            log.error("Bulk send failed — subject: '{}'. Cause: {}",
                    subject, rootCauseMessage(e));
            throw new IllegalStateException("Bulk email send failed: " + rootCauseMessage(e), e);
        }
    }

    /**
     * Very rough HTML → plain-text for the multipart fallback. Good
     * enough for mail clients that prefer text/plain: drops tags, decodes
     * the handful of named entities we actually emit, collapses
     * whitespace. Not a full parser — admins inclined to put complex
     * markup in a bulk email are fine getting "OK-ish" plain text.
     */
    private static String stripHtml(String html) {
        if (html == null) return "";
        return html.replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</p>", "\n\n")
                .replaceAll("<[^>]+>", "")
                .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&nbsp;", " ")
                .replaceAll("[ \\t]+", " ")
                .trim();
    }

    public String sendTest(String to) {
        if (!smtpConfigured) {
            return "SMTP not configured — MAIL_USERNAME is blank in the backend env.";
        }
        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
            try {
                helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            } catch (UnsupportedEncodingException e) {
                helper.setFrom(fromAddress);
            }
            helper.setTo(to);
            helper.setSubject("[EspritConnect] SMTP test");
            String html = template(
                    "SMTP test ✓",
                    "If you can read this, your SMTP credentials are valid and your sender is allowlisted.",
                    null, null,
                    "Sent from /admin/mail/test");
            helper.setText("EspritConnect SMTP test — success.", html);
            sender.send(msg);
            log.info("Test email sent to {}", to);
            return null;
        } catch (Exception e) {
            String msg = rootCauseMessage(e);
            log.error("Test email to {} failed: {}", to, msg);
            return msg;
        }
    }

    public void sendVerificationEmail(String to, String code) {
        String subject = "Your EspritConnect verification code";
        String html = codeTemplate(
                "Confirm your email 👋",
                "Use the 6-digit code below to verify your email address on EspritConnect. " +
                "The code is valid for 24 hours.",
                code,
                "If you didn't sign up, you can safely ignore this email.");
        send(to, subject, html,
                "Your EspritConnect verification code is: " + code +
                "\nEnter it on the verification screen to confirm your email. " +
                "The code expires in 24 hours.");
    }

    public void sendPasswordReset(String to, String token) {
        String link = baseUrl + "/reset-password?token=" + token;
        String subject = "Reset your EspritConnect password";
        String html = template(
                "Password reset request",
                "We received a request to reset your password. Click the button " +
                "below to set a new one. The link is valid for 2 hours.",
                "Reset my password", link,
                "If you didn't request a reset, ignore this email — your password stays unchanged.");
        send(to, subject, html,
                "Reset your password: " + link);
    }

    /**
     * Asks the user to complete identity verification (face + document
     * upload). Sent when an admin clicks "Request identity verification"
     * on a user that's already ACTIVE. The link points to the wizard's
     * identity-verification steps; clicking it logs the user in and
     * resumes the flow.
     */
    public void sendIdentityVerificationRequest(String to, String firstName) {
        String link = baseUrl + "/signup/wizard?resume=identity";
        String greeting = (firstName == null || firstName.isBlank()) ? "Hi" : "Hi " + firstName;
        String subject = "Please verify your identity on EspritConnect";
        String html = template(
                greeting + ", we need to verify your identity",
                "An admin has asked you to complete the identity-verification step on " +
                "your EspritConnect account. It takes about a minute: upload an ID document " +
                "and capture a short selfie.<br><br>" +
                "Once you're verified, a green badge appears on your profile and the " +
                "request banner in your account disappears.",
                "Verify my identity", link,
                "If you don't recognise this request, ignore the email or contact support.");
        send(to, subject, html,
                "An admin asked you to verify your identity. Go to " + link);
    }

    public void sendApprovalEmail(String to, String firstName) {
        String link = baseUrl + "/login";
        String greeting = (firstName == null || firstName.isBlank()) ? "Hi" : "Hi " + firstName;
        String subject = "Welcome to EspritConnect — your account is active";
        String html = template(
                greeting + ", you're in 🎉",
                "An admin reviewed your account and it's now active. Log in to start " +
                "connecting with the ESPRIT alumni network.",
                "Go to login", link,
                "Tip: complete your profile and join a few groups to get personalised recommendations.");
        send(to, subject, html,
                "Your EspritConnect account is now active. Log in: " + link);
    }

    public void sendSuspensionEmail(String to, String reason) {
        String r = (reason == null || reason.isBlank()) ? "(no reason given)" : reason;
        String subject = "Your EspritConnect account has been suspended";
        String html = template(
                "Account suspended",
                "An admin has suspended your account.<br><br><strong>Reason:</strong> " +
                escapeHtml(r) + "<br><br>If you believe this was a mistake, reply to this " +
                "email or contact <a href=\"mailto:support@espritconnect.tn\">support@espritconnect.tn</a>.",
                null, null,
                "");
        send(to, subject, html,
                "Your account has been suspended. Reason: " + r);
    }

    public void sendReactivationEmail(String to) {
        String link = baseUrl + "/login";
        String subject = "Your EspritConnect account is active again";
        String html = template(
                "Welcome back",
                "Your account has been reactivated. You can log in again now.",
                "Go to login", link,
                "");
        send(to, subject, html,
                "Your account is active again. Log in: " + link);
    }

    /**
     * Fired by the moderation flow when an admin approves a user's
     * event / group / mentor-profile / job submission.
     *
     * @param contentTypeLabel  e.g. "event", "group", "mentor profile", "job offer"
     * @param contentTitle      the item's title (e.g. "ML Career Day 2026")
     * @param viewUrl           absolute or relative path the recipient
     *                          should be sent to after clicking the CTA
     */
    public void sendContentApprovedEmail(String to, String contentTypeLabel,
                                          String contentTitle, String viewUrl) {
        String link = viewUrl.startsWith("http") ? viewUrl : baseUrl + viewUrl;
        String subject = "Your " + contentTypeLabel + " was approved 🎉";
        String html = template(
                "Approved by an admin",
                "Your <strong>" + escapeHtml(contentTypeLabel) + "</strong> "
                + (contentTitle == null ? "" : "&ldquo;" + escapeHtml(contentTitle) + "&rdquo; ")
                + "is now live on the network — other alumni can see it and engage with it.",
                "View it", link,
                "");
        send(to, subject, html,
                "Your " + contentTypeLabel + " is now live: " + link);
    }

    // ── AI-matching mailers (event-match, job-match, applications bundle) ──────

    /**
     * One file to attach to a multipart email. Used by
     * {@link #sendApplicationsBundle} to ship every applicant's CV plus a
     * generated CSV in a single message.
     */
    public record Attachment(String filename, byte[] bytes, String contentType) {}

    /**
     * "This event might be for you" — sent to a profile the AI matcher
     * picked as a good semantic fit for an approved event. {@code aiReason}
     * is the model's one-sentence justification (or the heuristic's).
     */
    public void sendEventMatchEmail(String to, String firstName,
                                     String eventTitle, Instant startAt, String location,
                                     String aiReason, String eventUrl) {
        String link = (eventUrl == null) ? baseUrl + "/events"
                : (eventUrl.startsWith("http") ? eventUrl : baseUrl + eventUrl);
        String greeting = (firstName == null || firstName.isBlank()) ? "Hi" : "Hi " + firstName;
        String when = startAt == null ? "" :
                DateTimeFormatter.ofPattern("EEEE, MMMM d 'at' h:mm a", java.util.Locale.ENGLISH)
                        .withZone(ZoneOffset.UTC).format(startAt) + " UTC";
        String subject = "An event that matches your profile 🎯 — " + eventTitle;
        String body = greeting + ", we spotted an event on EspritConnect that lines up with "
                + "what you're into:<br><br>"
                + "<strong>" + escapeHtml(eventTitle) + "</strong><br>"
                + (when.isBlank() ? "" : "<strong>When:</strong> " + escapeHtml(when) + "<br>")
                + (location == null || location.isBlank() ? ""
                        : "<strong>Where:</strong> " + escapeHtml(location) + "<br>")
                + (aiReason == null || aiReason.isBlank() ? ""
                        : "<br><em style=\"color:#555;\">&ldquo;" + escapeHtml(aiReason) + "&rdquo;</em>");
        String html = template(
                "An event that matches your profile 🎯",
                body,
                "Discover the event", link,
                "You're getting this because your activity on EspritConnect matches this event. "
                + "Manage your visibility in your profile settings.");
        send(to, subject, html,
                eventTitle + (when.isBlank() ? "" : " — " + when)
                + (aiReason == null || aiReason.isBlank() ? "" : "\n" + aiReason)
                + "\nDiscover the event: " + link);
    }

    /**
     * "A NN% match for you" — sent to a candidate who marked themselves
     * open to work and scored above the auto-notify threshold for a newly
     * approved job. Mirrors the in-app JOB_MATCH notification.
     */
    public void sendJobMatchEmail(String to, String firstName,
                                   String jobTitle, String companyName,
                                   String location, boolean remote,
                                   int matchScore, String aiReason, String jobUrl) {
        String link = (jobUrl == null) ? baseUrl + "/jobs"
                : (jobUrl.startsWith("http") ? jobUrl : baseUrl + jobUrl);
        String prefsLink = baseUrl + "/profile";
        String greeting = (firstName == null || firstName.isBlank()) ? "Hi" : "Hi " + firstName;
        String where = remote ? "Remote"
                : (location == null || location.isBlank() ? "" : location);
        String at = (companyName == null || companyName.isBlank()) ? "" : " @ " + companyName;
        String subject = "A " + matchScore + "% match for you: " + jobTitle + at;
        String body = greeting + ", a new role on EspritConnect is a strong fit for your profile:<br><br>"
                + "<strong>" + escapeHtml(jobTitle) + "</strong>"
                + (companyName == null || companyName.isBlank() ? "" : " · " + escapeHtml(companyName))
                + "<br>"
                + (where.isBlank() ? "" : "<strong>Location:</strong> " + escapeHtml(where) + "<br>")
                + "<strong>Match:</strong> " + matchScore + "%<br>"
                + (aiReason == null || aiReason.isBlank() ? ""
                        : "<br><em style=\"color:#555;\">&ldquo;" + escapeHtml(aiReason) + "&rdquo;</em>")
                + "<br><br><span style=\"font-size:12px;color:#777;\">You're receiving this because you marked "
                + "yourself <strong>open to work</strong>. "
                + "<a href=\"" + escapeAttr(prefsLink) + "\" style=\"color:#777;\">Update your preferences</a>.</span>";
        String html = template(
                "A " + matchScore + "% match for you: " + escapeHtml(jobTitle)
                        + (companyName == null || companyName.isBlank() ? "" : " @ " + escapeHtml(companyName)),
                body,
                "View role", link,
                "Sent because you're open to work — update preferences at " + prefsLink);
        send(to, subject, html,
                jobTitle + at + " — " + matchScore + "% match"
                + (where.isBlank() ? "" : " (" + where + ")")
                + (aiReason == null || aiReason.isBlank() ? "" : "\n" + aiReason)
                + "\nView role: " + link
                + "\n(You're open to work — update preferences: " + prefsLink + ")");
    }

    /**
     * Admin → recruiter consolidated mail: a free-text body plus every
     * applicant's CV and a summary CSV as attachments, sent in one
     * multipart message. Best-effort like the other mailers — swallows
     * failures so the admin console still reports the attempt.
     *
     * {@code bodyHtml} is the admin-authored body (HTML allowed, admin is
     * trusted) — it's wrapped in the branded card template here so the mail
     * matches the rest of the network, exactly like {@link #sendBulkBcc}.
     */
    /** @return true only if the message was actually handed to SMTP. False when
     *  SMTP isn't configured or the send failed — so the admin console can tell
     *  the operator the truth instead of a misleading "sent". */
    public boolean isSmtpConfigured() { return smtpConfigured; }

    public boolean sendApplicationsBundle(String to, String subject,
                                        String bodyHtml, String plainTextBody,
                                        List<Attachment> attachments) {
        List<Attachment> files = attachments == null ? List.of() : attachments;
        if (!smtpConfigured) {
            log.info("[DEV] Would email {} with {} attachment(s) — Subject: {}",
                    to, files.size(), subject);
            return false;
        }
        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
            try {
                helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            } catch (UnsupportedEncodingException e) {
                helper.setFrom(fromAddress);
            }
            helper.setTo(to);
            helper.setSubject(subject);
            String html = template(subject, bodyHtml, null, null,
                    "Sent from the EspritConnect admin console.");
            String plain = (plainTextBody == null || plainTextBody.isBlank())
                    ? stripHtml(bodyHtml) : plainTextBody;
            helper.setText(plain, html);
            for (Attachment a : files) {
                if (a == null || a.bytes() == null) continue;
                DataSource ds = new ByteArrayDataSource(a.bytes(),
                        a.contentType() == null ? "application/octet-stream" : a.contentType());
                helper.addAttachment(a.filename() == null ? "attachment" : a.filename(), ds);
            }
            sender.send(msg);
            log.info("Applications bundle sent to {} with {} attachment(s) — subject: {}",
                    to, files.size(), subject);
            return true;
        } catch (MailException | MessagingException e) {
            log.error("Failed to send applications bundle to {} — Cause: {}",
                    to, rootCauseMessage(e));
            return false;
        }
    }

    /** Tells the event organizer someone just RSVPd to one of their events,
     *  with a deep-link to the manage page where they can approve / reject. */
    public void sendNewRsvpEmail(String to, String organizerName,
                                  String eventTitle, String attendeeName,
                                  String attendeeEmail, String rsvpStatus,
                                  String eventId) {
        String link = baseUrl + "/events/manage/" + eventId;
        String subject = "New RSVP for " + eventTitle;
        String greet = (organizerName == null || organizerName.isBlank()) ? "Hi" : "Hi " + organizerName;
        String html = template(
                greet + ", you have a new RSVP 🎫",
                escapeHtml(attendeeName) + " (" + escapeHtml(attendeeEmail) + ") just RSVP'd "
                + "<strong>" + escapeHtml(rsvpStatus) + "</strong> for your event "
                + "<strong>&ldquo;" + escapeHtml(eventTitle) + "&rdquo;</strong>.<br><br>"
                + "Open the manage page to review the attendee list — you can approve or "
                + "reject this RSVP, and the attendee will receive a confirmation email "
                + "with a calendar invite once approved.",
                "Review attendees", link,
                "");
        send(to, subject, html,
                attendeeName + " RSVPd " + rsvpStatus + " for " + eventTitle + ". Manage: " + link);
    }

    /** Approval email for a confirmed attendee — includes a .ics attachment
     *  the recipient can drop straight into Google / Apple / Outlook calendar. */
    public void sendRsvpApprovedEmail(String to, String attendeeName,
                                       String eventTitle, String eventLocation,
                                       Instant startAt, Instant endAt,
                                       String eventId, String organizerEmail) {
        String link = baseUrl + "/events";
        String subject = "You're in — " + eventTitle;
        String when = startAt == null ? "" :
                DateTimeFormatter.ofPattern("EEEE, MMMM d 'at' h:mm a", java.util.Locale.ENGLISH)
                        .withZone(ZoneOffset.UTC).format(startAt) + " UTC";
        String html = template(
                "Confirmed 🎉",
                "Your RSVP for <strong>&ldquo;" + escapeHtml(eventTitle) + "&rdquo;</strong> "
                + "was approved by the organizer.<br><br>"
                + "<strong>When:</strong> " + escapeHtml(when) + "<br>"
                + (eventLocation == null || eventLocation.isBlank() ? ""
                        : "<strong>Where:</strong> " + escapeHtml(eventLocation) + "<br>")
                + "<br>We've attached a <strong>.ics calendar invite</strong> — "
                + "open it on your phone or click to add to Google Calendar / Outlook / Apple Calendar.",
                "Open EspritConnect", link,
                "");
        String ics = buildIcs(eventTitle, eventLocation, startAt, endAt,
                eventId, to, organizerEmail);
        sendWithAttachment(to, subject, html,
                "Your RSVP for " + eventTitle + " was approved. " + when,
                "event.ics", ics.getBytes(StandardCharsets.UTF_8),
                "text/calendar; method=REQUEST; charset=UTF-8");
    }

    /** Polite rejection email so the attendee isn't left wondering. */
    public void sendRsvpRejectedEmail(String to, String eventTitle, String reason) {
        String subject = "Your RSVP for " + eventTitle + " was not approved";
        String html = template(
                "RSVP not approved",
                "Unfortunately the organizer could not approve your RSVP for "
                + "<strong>&ldquo;" + escapeHtml(eventTitle) + "&rdquo;</strong>."
                + (reason == null || reason.isBlank() ? ""
                        : "<br><br><strong>Reason:</strong> " + escapeHtml(reason)),
                null, null,
                "");
        send(to, subject, html,
                "Your RSVP for " + eventTitle + " was not approved"
                + (reason == null || reason.isBlank() ? "." : ". Reason: " + reason));
    }

    /** Minimal RFC-5545 iCalendar body. Sufficient for Gmail / Outlook /
     *  Apple Calendar — they'll auto-detect the .ics attachment and offer
     *  to add it to the user's calendar. */
    private String buildIcs(String title, String location,
                             Instant startAt, Instant endAt,
                             String eventId, String attendeeEmail, String organizerEmail) {
        // RFC-5545 wants UTC stamps in YYYYMMDDTHHMMSSZ form.
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
                .withZone(ZoneOffset.UTC);
        String dtStart = startAt == null ? fmt.format(Instant.now())
                                          : fmt.format(startAt);
        // Default 2-hour event if endAt is null — most networking events.
        String dtEnd   = endAt   == null
                ? fmt.format(startAt == null ? Instant.now().plusSeconds(7200)
                                              : startAt.plusSeconds(7200))
                : fmt.format(endAt);
        String dtStamp = fmt.format(Instant.now());
        String uid     = (eventId == null ? UUID.randomUUID().toString() : eventId) + "@espritconnect";
        String safeLoc = location == null ? "" : icsEscape(location);
        return String.join("\r\n",
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "PRODID:-//EspritConnect//EN",
                "CALSCALE:GREGORIAN",
                "METHOD:REQUEST",
                "BEGIN:VEVENT",
                "UID:" + uid,
                "DTSTAMP:" + dtStamp,
                "DTSTART:" + dtStart,
                "DTEND:" + dtEnd,
                "SUMMARY:" + icsEscape(title == null ? "EspritConnect event" : title),
                "LOCATION:" + safeLoc,
                "DESCRIPTION:" + icsEscape("Confirmed via EspritConnect — see /events"),
                "ORGANIZER:mailto:" + (organizerEmail == null ? fromAddress : organizerEmail),
                "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:" + attendeeEmail,
                "STATUS:CONFIRMED",
                "END:VEVENT",
                "END:VCALENDAR"
        );
    }

    /** RFC-5545 escaping: comma, semicolon, backslash, newline. */
    private static String icsEscape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace(",", "\\,")
                .replace(";", "\\;")
                .replace("\n", "\\n")
                .replace("\r", "");
    }

    /** Variant of send() that attaches a single byte[] (used for the .ics file). */
    private void sendWithAttachment(String to, String subject, String html,
                                     String plainTextFallback,
                                     String attachmentName, byte[] attachmentBytes,
                                     String attachmentContentType) {
        if (!smtpConfigured) {
            log.info("[DEV] Would email {} with attachment {} — Subject: {}",
                    to, attachmentName, subject);
            return;
        }
        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
            try {
                helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            } catch (UnsupportedEncodingException e) {
                helper.setFrom(fromAddress);
            }
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(plainTextFallback, html);
            DataSource ds = new ByteArrayDataSource(attachmentBytes, attachmentContentType);
            helper.addAttachment(attachmentName, ds);
            sender.send(msg);
            log.info("Email sent to {} with attachment {} — subject: {}", to, attachmentName, subject);
        } catch (MailException | MessagingException e) {
            log.error("Failed to send email with attachment to {} — Cause: {}",
                    to, rootCauseMessage(e));
        }
    }

    /** Fired when an admin rejects a submission, optionally with a reason. */
    public void sendContentRejectedEmail(String to, String contentTypeLabel,
                                          String contentTitle, String reason) {
        String subject = "Your " + contentTypeLabel + " was not approved";
        String html = template(
                "Submission rejected",
                "Your <strong>" + escapeHtml(contentTypeLabel) + "</strong> "
                + (contentTitle == null ? "" : "&ldquo;" + escapeHtml(contentTitle) + "&rdquo; ")
                + "was rejected by an admin.<br><br>"
                + (reason == null || reason.isBlank()
                        ? "No specific reason was provided."
                        : "<strong>Reason:</strong> " + escapeHtml(reason))
                + "<br><br>You can revise and resubmit, or reply to this email if you have questions.",
                null, null,
                "");
        send(to, subject, html,
                "Your " + contentTypeLabel + " was rejected"
                + (reason == null || reason.isBlank() ? "." : ". Reason: " + reason));
    }

    // ── Internals ────────────────────────────────────────────────────────────

    /** Actually deliver via SMTP, or log when SMTP isn't configured. */
    private void send(String to, String subject, String html, String plainTextFallback) {
        if (!smtpConfigured) {
            log.info("""
                    ╔══════════════════════════════════════════════╗
                      [DEV] Email NOT sent (SMTP unconfigured)
                      → {}
                      Subject: {}
                      {}
                    ╚══════════════════════════════════════════════╝""",
                    to, subject, plainTextFallback);
            return;
        }

        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
            try {
                helper.setFrom(new InternetAddress(fromAddress, fromName, StandardCharsets.UTF_8.name()));
            } catch (UnsupportedEncodingException e) {
                helper.setFrom(fromAddress);   // fallback if the JVM lacks UTF-8 (it won't)
            }
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(plainTextFallback, html);   // multipart: plain + html
            sender.send(msg);
            log.info("Email sent to {} — subject: {}", to, subject);
        } catch (MailException | MessagingException e) {
            // Don't break the calling flow on a mail glitch. Operators can
            // resend via /auth/resend-verification or the admin force-reset
            // button if delivery genuinely failed.
            //
            // Walk the cause chain to surface the real SMTP server response
            // (e.g. "525 5.7.1 Unauthorized IP address"). Spring wraps the
            // jakarta.mail exception so its top-level getMessage() is just
            // "Authentication failed" — useless for diagnosis.
            log.error("Failed to send email to {} — subject: {}. Cause: {}",
                    to, subject, rootCauseMessage(e));
        }
    }

    /** Walk the exception cause chain and join all distinct messages. */
    private static String rootCauseMessage(Throwable t) {
        StringBuilder sb = new StringBuilder();
        String last = null;
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            String msg = cur.getClass().getSimpleName() +
                         (cur.getMessage() == null ? "" : ": " + cur.getMessage().trim());
            if (!msg.equals(last)) {
                if (sb.length() > 0) sb.append(" → ");
                sb.append(msg);
                last = msg;
            }
            if (cur.getCause() == cur) break;   // defensive against self-cycles
        }
        return sb.toString();
    }

    /** Minimal responsive HTML template — inline styles so Gmail keeps them. */
    private String template(String headline, String body,
                            String ctaLabel, String ctaHref,
                            String footer) {
        String cta = (ctaLabel == null || ctaHref == null) ? "" : """
                <p style="margin:24px 0;">
                  <a href="%s" style="display:inline-block;padding:12px 24px;
                     background:#E63946;color:#fff;text-decoration:none;
                     font-weight:600;border-radius:8px;">%s</a>
                </p>
                <p style="font-size:12px;color:#666;">Or paste this link in your browser:<br>
                  <a href="%s" style="color:#666;word-break:break-all;">%s</a></p>
                """.formatted(escapeAttr(ctaHref), escapeHtml(ctaLabel),
                              escapeAttr(ctaHref), escapeHtml(ctaHref));

        return """
                <!doctype html>
                <html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;
                                    background:#f6f6f8;margin:0;padding:24px;color:#1a1a1a;">
                  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
                              padding:32px;border:1px solid #e5e5ea;">
                    <p style="font-family:ui-monospace,monospace;font-size:12px;color:#E63946;
                              margin:0 0 12px;">▸ ESPRITCONNECT</p>
                    <h1 style="font-size:22px;margin:0 0 16px;">%s</h1>
                    <p style="line-height:1.55;color:#3a3a3a;">%s</p>
                    %s
                    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
                    <p style="font-size:12px;color:#999;margin:0;">%s</p>
                  </div>
                </body></html>
                """.formatted(escapeHtml(headline), body, cta, escapeHtml(footer));
    }

    /** Variant of {@link #template} that renders a prominent code box instead of a CTA button.
     *  Used for OTP-style email verification — the user copies the code and pastes it into the site. */
    private String codeTemplate(String headline, String body, String code, String footer) {
        String safeCode = escapeHtml(code);
        String codeBox = """
                <div style="margin:24px 0;text-align:center;">
                  <div style="display:inline-block;padding:18px 32px;background:#f6f6f8;
                              border:1px solid #e5e5ea;border-radius:12px;
                              font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                              font-size:32px;font-weight:700;letter-spacing:10px;color:#1a1a1a;">
                    %s
                  </div>
                </div>
                <p style="font-size:12px;color:#666;text-align:center;">
                  Enter this code on the verification screen.
                </p>
                """.formatted(safeCode);

        return """
                <!doctype html>
                <html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;
                                    background:#f6f6f8;margin:0;padding:24px;color:#1a1a1a;">
                  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;
                              padding:32px;border:1px solid #e5e5ea;">
                    <p style="font-family:ui-monospace,monospace;font-size:12px;color:#E63946;
                              margin:0 0 12px;">▸ ESPRITCONNECT</p>
                    <h1 style="font-size:22px;margin:0 0 16px;">%s</h1>
                    <p style="line-height:1.55;color:#3a3a3a;">%s</p>
                    %s
                    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
                    <p style="font-size:12px;color:#999;margin:0;">%s</p>
                  </div>
                </body></html>
                """.formatted(escapeHtml(headline), body, codeBox, escapeHtml(footer));
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private static String escapeAttr(String s) {
        return escapeHtml(s);
    }
}
