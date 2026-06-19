package tn.esprit.connect.modules.admin.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tn.esprit.connect.modules.admin.dto.AdminDtos.CategoryCount;
import tn.esprit.connect.modules.admin.dto.AdminDtos.TimeSeriesPoint;
import tn.esprit.connect.modules.admin.dto.AdminDtos.TopCompanyRow;
import tn.esprit.connect.modules.admin.dto.AdminDtos.TopJobRow;
import tn.esprit.connect.modules.admin.dto.AdminDtos.TopMentorRow;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * All aggregations for the admin dashboard live here so the service stays thin.
 *
 * Implementation notes:
 *  - Uses native Postgres SQL (date_trunc, generate_series) for time-series
 *    so each chart can return a continuous, gap-filled window — doing the
 *    fill in SQL avoids week-long arguments about timezones in Java.
 *  - All counts honor the soft-delete convention (deleted_at IS NULL).
 *  - "Active in last N days" is defined as: did any of {login, post,
 *    comment, apply, message} within the window. Implemented as a UNION
 *    over user_id columns of those tables to avoid scanning each separately.
 */
@Repository
public class StatsRepository {

    private final JdbcTemplate jdbc;

    public StatsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─── Simple counts ─────────────────────────────────────────────────────

    public long countAlive(String table) {
        Long n = jdbc.queryForObject(
                "select count(*) from " + table + " where deleted_at is null",
                Long.class);
        return n == null ? 0L : n;
    }

    public long countUsersByStatus(String status) {
        Long n = jdbc.queryForObject("""
                select count(*) from users
                 where deleted_at is null and status::text = ?
                """, Long.class, status);
        return n == null ? 0L : n;
    }

    public long countUsersByRole(String role) {
        Long n = jdbc.queryForObject("""
                select count(*) from users
                 where deleted_at is null and role::text = ?
                """, Long.class, role);
        return n == null ? 0L : n;
    }

    public long countUsersCreatedSince(Instant since) {
        Long n = jdbc.queryForObject(
                "select count(*) from users where deleted_at is null and created_at >= ?",
                Long.class, java.sql.Timestamp.from(since));
        return n == null ? 0L : n;
    }

    public long countUsersCreatedBetween(Instant fromInclusive, Instant toExclusive) {
        Long n = jdbc.queryForObject("""
                select count(*) from users
                 where deleted_at is null
                   and created_at >= ?
                   and created_at <  ?
                """, Long.class,
                java.sql.Timestamp.from(fromInclusive),
                java.sql.Timestamp.from(toExclusive));
        return n == null ? 0L : n;
    }

    public long countApplicationsCreatedSince(Instant since) {
        Long n = jdbc.queryForObject(
                "select count(*) from job_applications where deleted_at is null and created_at >= ?",
                Long.class, java.sql.Timestamp.from(since));
        return n == null ? 0L : n;
    }

    /**
     * Distinct users with any activity in the last N days. Activity =
     * logged in, authored a post or comment, sent a message, or submitted
     * a job application.
     */
    public long countActiveUsersSince(Instant since) {
        java.sql.Timestamp t = java.sql.Timestamp.from(since);
        Long n = jdbc.queryForObject("""
                select count(*) from (
                  select id           as uid from users            where deleted_at is null and last_login_at >= ?
                  union
                  select author_id    as uid from posts            where deleted_at is null and created_at    >= ?
                  union
                  select author_id    as uid from comments         where deleted_at is null and created_at    >= ?
                  union
                  select sender_id    as uid from messages         where deleted_at is null and created_at    >= ?
                  union
                  select applicant_id as uid from job_applications where deleted_at is null and created_at    >= ?
                ) s
                """, Long.class, t, t, t, t, t);
        return n == null ? 0L : n;
    }

    // ─── Category breakdowns ───────────────────────────────────────────────

    public List<CategoryCount> usersByRole() {
        return jdbc.query("""
                select role::text as label, count(*) as cnt
                  from users where deleted_at is null
                 group by role order by cnt desc
                """,
                (rs, i) -> new CategoryCount(rs.getString("label"), rs.getLong("cnt")));
    }

    public List<CategoryCount> usersByStatus() {
        return jdbc.query("""
                select status::text as label, count(*) as cnt
                  from users where deleted_at is null
                 group by status order by cnt desc
                """,
                (rs, i) -> new CategoryCount(rs.getString("label"), rs.getLong("cnt")));
    }

    /**
     * Profiles grouped by country (display name as stored). NULL/blank
     * entries are collapsed into the "Unknown" bucket so the dashboard
     * can show a "X users with no location" footnote. Country names are
     * normalized to ISO 3166-1 alpha-2 codes on the frontend.
     */
    public List<CategoryCount> usersByCountry() {
        return jdbc.query("""
                select coalesce(nullif(trim(country), ''), 'Unknown') as label,
                       count(*)                                       as cnt
                  from profiles
                 where deleted_at is null
                 group by coalesce(nullif(trim(country), ''), 'Unknown')
                 order by cnt desc
                """,
                (rs, i) -> new CategoryCount(rs.getString("label"), rs.getLong("cnt")));
    }

    /**
     * Profiles grouped by promotion year. Profiles without a linked
     * promotion are excluded — keeps the chart readable. Ordered
     * chronologically so the bar chart reads left-to-right.
     */
    public List<CategoryCount> usersByPromotionYear() {
        return jdbc.query("""
                select cast(p.year as text) as label, count(*) as cnt
                  from profiles pr
                  join promotions p on p.id = pr.promotion_id
                 where pr.deleted_at is null
                   and p.deleted_at is null
                 group by p.year
                 order by p.year
                """,
                (rs, i) -> new CategoryCount(rs.getString("label"), rs.getLong("cnt")));
    }

    // ─── Time-series ───────────────────────────────────────────────────────

    public List<TimeSeriesPoint> signupsByMonth(int months) {
        return monthlyCount("users", months);
    }

    public List<TimeSeriesPoint> applicationsByMonth(int months) {
        return monthlyCount("job_applications", months);
    }

    private List<TimeSeriesPoint> monthlyCount(String table, int months) {
        String sql = """
                with months as (
                  select generate_series(
                           date_trunc('month', now()) - make_interval(months => ?),
                           date_trunc('month', now()),
                           interval '1 month'
                         ) as month_start
                )
                select to_char(m.month_start, 'YYYY-MM') as bucket,
                       coalesce(count(t.id), 0)         as cnt
                  from months m
                  left join %s t
                         on date_trunc('month', t.created_at) = m.month_start
                        and t.deleted_at is null
                 group by m.month_start
                 order by m.month_start
                """.formatted(table);
        return jdbc.query(sql,
                (rs, i) -> new TimeSeriesPoint(rs.getString("bucket"), rs.getLong("cnt")),
                months - 1);
    }

    // ─── Top-N lists ───────────────────────────────────────────────────────

    public List<TopJobRow> topJobsByApplications(int limit) {
        return jdbc.query("""
                select jo.id            as job_id,
                       jo.title         as title,
                       coalesce(c.name, '—') as company_name,
                       count(ja.id)     as cnt
                  from job_offers jo
                  left join job_applications ja
                         on ja.job_offer_id = jo.id
                        and ja.deleted_at is null
                  left join companies c
                         on c.id = jo.company_id
                 where jo.deleted_at is null
                 group by jo.id, jo.title, c.name
                 order by cnt desc, jo.created_at desc
                 limit ?
                """,
                (rs, i) -> new TopJobRow(
                        (UUID) rs.getObject("job_id"),
                        rs.getString("title"),
                        rs.getString("company_name"),
                        rs.getLong("cnt")),
                limit);
    }

    /**
     * Top recruiting companies ranked by number of <b>active</b> postings —
     * non-deleted, APPROVED moderation, and not yet expired.
     */
    public List<TopCompanyRow> topCompaniesByActivePostings(int limit) {
        return jdbc.query("""
                select c.id                         as company_id,
                       coalesce(c.name, '—')       as company_name,
                       count(jo.id)                 as active_postings,
                       coalesce(sum(app_cnt.cnt),0) as total_applications
                  from companies c
                  left join job_offers jo
                         on jo.company_id = c.id
                        and jo.deleted_at is null
                        and jo.moderation_status = 'APPROVED'
                        and (jo.expires_at is null or jo.expires_at > now())
                  left join lateral (
                         select count(*) as cnt
                           from job_applications ja
                          where ja.job_offer_id = jo.id
                            and ja.deleted_at is null
                       ) app_cnt on true
                 where c.deleted_at is null
                 group by c.id, c.name
                 having count(jo.id) > 0
                 order by active_postings desc, total_applications desc
                 limit ?
                """,
                (rs, i) -> new TopCompanyRow(
                        (UUID) rs.getObject("company_id"),
                        rs.getString("company_name"),
                        rs.getLong("active_postings"),
                        rs.getLong("total_applications")),
                limit);
    }

    /**
     * Top mentors by completed sessions. A "completed" session is one
     * whose scheduled_at is in the past — there is no explicit completion
     * flag, so this is the best signal available.
     */
    public List<TopMentorRow> topMentorsBySessions(int limit) {
        return jdbc.query("""
                select u.id                                                       as user_id,
                       coalesce(p.first_name || ' ' || p.last_name, u.email)      as display_name,
                       count(ms.id)                                               as sessions
                  from users u
                  join mentor_profiles mp on mp.user_id = u.id and mp.deleted_at is null
                  join mentorship_requests mr on mr.mentor_profile_id = mp.id and mr.deleted_at is null
                  join mentorship_sessions ms
                       on ms.request_id = mr.id
                      and ms.deleted_at is null
                      and ms.scheduled_at < now()
                  left join profiles p on p.user_id = u.id and p.deleted_at is null
                 where u.deleted_at is null
                 group by u.id, p.first_name, p.last_name, u.email
                 order by sessions desc
                 limit ?
                """,
                (rs, i) -> new TopMentorRow(
                        (UUID) rs.getObject("user_id"),
                        rs.getString("display_name"),
                        rs.getLong("sessions")),
                limit);
    }

    /**
     * Average applications per <i>posted</i> job (jobs with zero
     * applications are included in the denominator so the metric reflects
     * overall posting performance, not just popular ones).
     */
    public double avgApplicationsPerPosting() {
        Double v = jdbc.queryForObject("""
                with per_job as (
                  select jo.id, count(ja.id) as cnt
                    from job_offers jo
                    left join job_applications ja
                           on ja.job_offer_id = jo.id
                          and ja.deleted_at is null
                   where jo.deleted_at is null
                   group by jo.id
                )
                select coalesce(avg(cnt), 0) from per_job
                """, Double.class);
        return v == null ? 0.0 : v;
    }
}
