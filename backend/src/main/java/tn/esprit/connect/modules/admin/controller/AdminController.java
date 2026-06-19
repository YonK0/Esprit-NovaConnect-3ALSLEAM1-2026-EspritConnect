package tn.esprit.connect.modules.admin.controller;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.admin.dto.AdminDtos.AdminUserResponse;
import tn.esprit.connect.modules.admin.dto.AdminDtos.ChangeRoleRequest;
import tn.esprit.connect.modules.admin.dto.AdminDtos.*;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tn.esprit.connect.modules.admin.service.AdminExportService;
import tn.esprit.connect.modules.admin.service.AdminMailService;
import tn.esprit.connect.modules.admin.service.AdminService;
import tn.esprit.connect.modules.admin.service.StatsService;
import tn.esprit.connect.modules.auth.service.MailService;
import tn.esprit.connect.security.CustomUserDetails;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@Tag(name = "Admin")
public class AdminController {

    private final AdminService adminService;
    private final MailService mailService;
    private final StatsService statsService;
    private final AdminExportService exportService;
    private final AdminMailService adminMailService;

    @GetMapping("/stats")
    public ResponseEntity<DashboardStats> stats() {
        return ResponseEntity.ok(adminService.stats());
    }

    /**
     * Rich dashboard payload: KPIs, role/status/promotion breakdowns,
     * 12-month signup & application time-series, top jobs/companies/mentors.
     * The smaller /stats endpoint above is kept for the simpler overview tile.
     */
    @GetMapping("/stats/overview")
    public ResponseEntity<OverviewStats> overview() {
        return ResponseEntity.ok(statsService.overview());
    }

    @PostMapping("/users/{id}/approve")
    public ResponseEntity<Void> approve(@AuthenticationPrincipal CustomUserDetails u,
                                        @PathVariable UUID id) {
        adminService.approveUser(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/suspend")
    public ResponseEntity<Void> suspend(@AuthenticationPrincipal CustomUserDetails u,
                                        @PathVariable UUID id,
                                        @RequestParam(required = false) String reason) {
        adminService.suspendUser(id, u.getId(), reason);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/audit-logs")
    public ResponseEntity<Page<AuditLogResponse>> logs(Pageable p) {
        return ResponseEntity.ok(adminService.auditLogs(p));
    }

    @GetMapping("/users")
    public ResponseEntity<Page<AdminUserResponse>> users(Pageable p) {
        return ResponseEntity.ok(adminService.listUsers(p));
    }

    /**
     * Streams the entire (non-deleted) users table as CSV. Returns
     * {@code Content-Disposition: attachment} so the browser saves it as
     * a file. Streaming avoids buffering thousands of rows in memory.
     */
    @GetMapping("/users/export.csv")
    public ResponseEntity<StreamingResponseBody> exportUsersCsv() {
        String filename = "espritconnect-users-" + LocalDate.now() + ".csv";
        StreamingResponseBody body = exportService::streamUsersCsv;
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(body);
    }

    /**
     * Sends a single email to every ACTIVE user in {@code list} via BCC.
     * One SMTP message regardless of list size; recipients can't see
     * each other. Result includes the recipient count actually delivered.
     */
    @PostMapping("/mail/bulk")
    public ResponseEntity<BulkMailResponse> mailBulk(@AuthenticationPrincipal CustomUserDetails u,
                                                     @RequestBody BulkMailRequest req) {
        return ResponseEntity.ok(adminMailService.send(
                u.getId(), req.list(), req.subject(), req.bodyHtml()));
    }

    @PatchMapping("/users/{id}/role")
    public ResponseEntity<Void> changeRole(@AuthenticationPrincipal CustomUserDetails u,
                                           @PathVariable UUID id,
                                           @RequestBody ChangeRoleRequest req) {
        adminService.changeRole(id, u.getId(), req.role());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/activate")
    public ResponseEntity<Void> activate(@AuthenticationPrincipal CustomUserDetails u,
                                         @PathVariable UUID id) {
        adminService.approveUser(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/users/{id}/email-verified")
    public ResponseEntity<Void> setEmailVerified(@AuthenticationPrincipal CustomUserDetails u,
                                                  @PathVariable UUID id,
                                                  @RequestParam boolean verified) {
        adminService.setEmailVerified(id, u.getId(), verified);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/force-password-reset")
    public ResponseEntity<Void> forcePasswordReset(@AuthenticationPrincipal CustomUserDetails u,
                                                    @PathVariable UUID id) {
        adminService.forcePasswordReset(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@AuthenticationPrincipal CustomUserDetails u,
                                           @PathVariable UUID id) {
        adminService.deleteUser(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Asks the user to (re)complete the identity-verification flow.
     * Idempotent: clicking it on a user who already has a pending
     * request just refreshes the timestamp and re-sends the email.
     */
    @PostMapping("/users/{id}/request-identity-verification")
    public ResponseEntity<Void> requestIdentityVerification(@AuthenticationPrincipal CustomUserDetails u,
                                                             @PathVariable UUID id) {
        adminService.requestIdentityVerification(id, u.getId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Diagnostic — sends a synchronous test email and returns the SMTP
     * server's response verbatim (or {ok:true} on success). Use this to
     * verify Brevo / Gmail / Mailtrap credentials without running the full
     * signup flow. The response body always returns the real error message
     * so you can read 525/535/550 codes directly in curl output.
     */
    @PostMapping("/mail/test")
    public ResponseEntity<Map<String, Object>> mailTest(@RequestParam String to) {
        String err = mailService.sendTest(to);
        if (err == null) {
            return ResponseEntity.ok(Map.of("ok", true, "to", to));
        }
        return ResponseEntity.status(502).body(Map.of(
                "ok", false, "to", to, "error", err));
    }
}
