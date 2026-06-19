package tn.esprit.connect.modules.admin.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class AdminDtos {
    private AdminDtos() {}

    public record DashboardStats(long totalUsers, long activeUsers,
                                  long pendingUsers, long totalPosts,
                                  long totalJobs, long totalEvents) {}

    public record AuditLogResponse(UUID id, UUID userId, String action,
                                    Map<String, Object> metadata, Instant createdAt) {}

    public record AdminUserResponse(UUID id, String email, String role, String status,
                                     Instant createdAt, Instant lastLoginAt,
                                     boolean emailVerified, boolean identityVerified,
                                     Instant identityVerificationRequestedAt) {}

    public record ChangeRoleRequest(String role) {}

    /**
     * Body of POST /api/v1/admin/mail/bulk.
     *
     * @param list      one of "STUDENT","ALUMNI","MENTOR","RECRUITER","ADMIN","ALL"
     *                  (case-insensitive). "ALL" includes every non-deleted ACTIVE user.
     * @param subject   email subject line; required.
     * @param bodyHtml  HTML body. The admin is trusted to author this — it's
     *                  rendered inside the same template as transactional emails.
     */
    public record BulkMailRequest(String list, String subject, String bodyHtml) {}

    public record BulkMailResponse(String list, long recipientCount, boolean ok) {}

    /** Headline numbers shown in the dashboard KPI strip. */
    public record OverviewKpis(
            long totalUsers,
            long activeUsers,
            long pendingVerifications,
            long alumniCount,
            long mentorCount,
            long recruiterCount,
            long totalJobs,
            long totalApplications,
            long applicationsThisMonth,
            long newUsersThisMonth,
            long totalEvents,
            long totalPosts,
            /** New users this month vs last month, as a percentage (e.g. 12.5 or -3.0). null when last month was 0. */
            Double totalUsersChangePct,
            /** Distinct users active (login, post, comment, message, application) in the last 30 days. */
            long activeUsersLast30Days,
            /** Average applications per posted job, fractional. */
            double avgApplicationsPerPosting
    ) {}

    public record TopCompanyRow(UUID companyId, String companyName,
                                 long activePostings, long totalApplications) {}

    public record TopMentorRow(UUID userId, String displayName, long sessionsCompleted) {}

    /** One row per {month, count} bucket — used by the time-series charts. */
    public record TimeSeriesPoint(String month, long count) {}

    /** One row per {label, count} bucket — used by donut / bar breakdowns. */
    public record CategoryCount(String label, long count) {}

    /** Single top-N row used by the "most-applied jobs" list. */
    public record TopJobRow(UUID jobId, String title, String companyName, long applicationCount) {}

    /** Full payload returned by GET /api/v1/admin/stats/overview. */
    public record OverviewStats(
            OverviewKpis kpis,
            List<CategoryCount> usersByRole,
            List<CategoryCount> usersByStatus,
            List<CategoryCount> usersByPromotionYear,
            List<CategoryCount> usersByCountry,
            List<TimeSeriesPoint> signupsByMonth,
            List<TimeSeriesPoint> applicationsByMonth,
            List<TopJobRow> topJobsByApplications,
            List<TopCompanyRow> topCompaniesByActivePostings,
            List<TopMentorRow> topMentorsBySessions
    ) {}
}
