package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.BusinessException;
import tn.esprit.connect.modules.admin.dto.AdminJobsDtos.AdminJobSummary;
import tn.esprit.connect.modules.admin.dto.AdminJobsDtos.EmailApplicationsResult;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.modules.job.dto.JobDtos.ApplicationResponse;
import tn.esprit.connect.modules.job.service.JobService;
import tn.esprit.connect.modules.job.service.JobService.RecruiterApplicationsBundle;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Task-3: builds the consolidated "all applications" email an admin sends to
 * a recruiter — every applicant's CV plus a summary CSV, in one message.
 *
 * The DB read (job + recruiter + applications) happens in
 * {@link JobService#applicationsForAdmin} (a read-only transaction returning
 * plain DTOs), so the slow IO here — downloading CVs over HTTP and the SMTP
 * send — runs OUTSIDE any transaction and can't hold a DB connection or roll
 * anything back. Sent synchronously so the admin gets immediate confirmation.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdminApplicationsMailService {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    private static final String[] CSV_HEADERS = {
            "Candidate name", "Email", "Application date", "Status",
            "CV filename", "Cover letter excerpt"
    };

    private final JdbcTemplate jdbc;
    private final JobService jobService;
    private final MailService mailService;

    /** Paged list of approved job offers with their application counts. */
    @Transactional(readOnly = true)
    public Page<AdminJobSummary> listJobs(Pageable pageable) {
        Long total = jdbc.queryForObject(
                "SELECT count(*) FROM job_offers j WHERE j.deleted_at IS NULL "
                + "AND j.moderation_status = 'APPROVED'", Long.class);
        String sql = """
            SELECT j.id, j.title, c.name AS company_name, u.email AS posted_by_email,
                   j.created_at,
                   (SELECT count(*) FROM job_applications a WHERE a.job_offer_id = j.id) AS apps_count
            FROM job_offers j
            JOIN companies c ON c.id = j.company_id
            JOIN users u     ON u.id = j.posted_by
            WHERE j.deleted_at IS NULL AND j.moderation_status = 'APPROVED'
            ORDER BY j.created_at DESC
            LIMIT ? OFFSET ?
            """;
        List<AdminJobSummary> rows = jdbc.query(sql, (rs, i) -> new AdminJobSummary(
                rs.getObject("id", UUID.class),
                rs.getString("title"),
                rs.getString("company_name"),
                rs.getString("posted_by_email"),
                rs.getLong("apps_count"),
                rs.getTimestamp("created_at").toInstant()),
                pageable.getPageSize(), pageable.getOffset());
        return new PageImpl<>(rows, pageable, total == null ? rows.size() : total);
    }

    /** Full application list for a job — admin bypasses the poster-only check. */
    public RecruiterApplicationsBundle applications(UUID jobId) {
        return jobService.applicationsForAdmin(jobId);
    }

    /** Build + send the consolidated email; returns the synchronous result. */
    public EmailApplicationsResult emailApplications(UUID jobId, String subject, String body) {
        RecruiterApplicationsBundle bundle = jobService.applicationsForAdmin(jobId);
        if (bundle.recruiterEmail() == null || bundle.recruiterEmail().isBlank()) {
            throw new BusinessException("This job has no recruiter email on file.");
        }

        List<MailService.Attachment> attachments = new ArrayList<>();
        Map<UUID, String> cvFilenameByApp = new LinkedHashMap<>();
        Set<String> usedNames = new HashSet<>();

        // Download each applicant's CV (best-effort — a missing/failed CV is
        // noted in the CSV rather than aborting the whole send).
        for (ApplicationResponse app : bundle.applications()) {
            MailService.Attachment cv = downloadCv(app.cvUrl(), app.applicantName(), usedNames);
            if (cv != null) {
                attachments.add(cv);
                cvFilenameByApp.put(app.id(), cv.filename());
            }
        }

        // Summary spreadsheet — built after downloads so it can reference the
        // exact attached CV filenames.
        String csvName = "applications-" + slug(bundle.jobTitle()) + "-"
                + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE) + ".csv";
        attachments.add(new MailService.Attachment(csvName,
                buildCsv(bundle.applications(), cvFilenameByApp),
                "text/csv; charset=UTF-8"));

        if (!mailService.isSmtpConfigured()) {
            throw new BusinessException(
                "Email isn't configured on the server. Set MAIL_USERNAME and MAIL_PASSWORD "
                + "in the backend .env (a Gmail App Password works) and restart the backend, then try again.");
        }

        String safeBody = body == null ? "" : body;
        boolean sent = mailService.sendApplicationsBundle(bundle.recruiterEmail(), subject,
                safeBody.replace("\n", "<br>"), safeBody, attachments);
        if (!sent) {
            throw new BusinessException(
                "Email delivery to " + bundle.recruiterEmail() + " failed — the SMTP server rejected "
                + "the message or the port is blocked. Check the backend logs and your MAIL_* settings "
                + "(try port 465 with MAIL_SSL=true if 587 is blocked).");
        }

        log.info("Admin applications bundle for job {} → {} ({} attachment(s))",
                jobId, bundle.recruiterEmail(), attachments.size());
        return new EmailApplicationsResult(Instant.now(), attachments.size(), bundle.recruiterEmail());
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private MailService.Attachment downloadCv(String cvUrl, String applicantName, Set<String> usedNames) {
        if (cvUrl == null || cvUrl.isBlank()) return null;
        try {
            HttpResponse<byte[]> resp = HTTP.send(
                    HttpRequest.newBuilder(URI.create(cvUrl)).GET()
                            .timeout(Duration.ofSeconds(20)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200 || resp.body() == null || resp.body().length == 0) {
                log.warn("CV download returned {} for {}", resp.statusCode(), cvUrl);
                return null;
            }
            String contentType = resp.headers().firstValue("content-type")
                    .orElse("application/octet-stream");
            String filename = uniqueName(cvFilename(applicantName, cvUrl), usedNames);
            return new MailService.Attachment(filename, resp.body(), contentType);
        } catch (Exception e) {
            log.warn("CV download failed for {}: {}", cvUrl, e.getMessage());
            return null;
        }
    }

    private byte[] buildCsv(List<ApplicationResponse> apps, Map<UUID, String> cvFilenameByApp) {
        StringBuilder sb = new StringBuilder();
        sb.append('﻿');   // UTF-8 BOM so Excel reads accents correctly
        sb.append(String.join(",", CSV_HEADERS)).append("\r\n");
        for (ApplicationResponse a : apps) {
            String cvName = cvFilenameByApp.get(a.id());
            if (cvName == null) {
                cvName = (a.cvUrl() == null || a.cvUrl().isBlank())
                        ? "(no CV)" : "(download failed)";
            }
            appendRow(sb,
                    a.applicantName(),
                    a.applicantEmail(),
                    a.createdAt() == null ? "" : a.createdAt().toString(),
                    a.status() == null ? "" : a.status().name(),
                    cvName,
                    excerpt(a.coverLetter(), 160));
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void appendRow(StringBuilder sb, String... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(csvEscape(values[i]));
        }
        sb.append("\r\n");
    }

    /** RFC-4180 escaping — quote only when needed (mirrors AdminExportService). */
    private static String csvEscape(String v) {
        if (v == null) return "";
        boolean q = v.indexOf(',') >= 0 || v.indexOf('"') >= 0
                || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0;
        return q ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
    }

    private static String excerpt(String s, int max) {
        if (s == null) return "";
        String oneLine = s.replaceAll("\\s+", " ").trim();
        return oneLine.length() <= max ? oneLine : oneLine.substring(0, max) + "…";
    }

    private static String cvFilename(String name, String url) {
        String base = "CV-" + (slug(name).isBlank() ? "candidate" : slug(name));
        String ext = extOf(url);
        return ext.isEmpty() ? base : base + "." + ext;
    }

    private static String uniqueName(String name, Set<String> used) {
        if (used.add(name)) return name;
        int dot = name.lastIndexOf('.');
        String stem = dot < 0 ? name : name.substring(0, dot);
        String ext = dot < 0 ? "" : name.substring(dot);
        for (int i = 2; ; i++) {
            String candidate = stem + "-" + i + ext;
            if (used.add(candidate)) return candidate;
        }
    }

    private static String slug(String s) {
        if (s == null) return "";
        return s.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
    }

    private static String extOf(String url) {
        if (url == null) return "";
        String path = url;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int slash = path.lastIndexOf('/');
        if (slash >= 0) path = path.substring(slash + 1);
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot == path.length() - 1) return "";
        String ext = path.substring(dot + 1).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        return ext.length() > 5 ? ext.substring(0, 5) : ext;
    }
}
