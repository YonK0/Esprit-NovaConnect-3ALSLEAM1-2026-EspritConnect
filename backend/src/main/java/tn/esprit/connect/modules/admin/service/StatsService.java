package tn.esprit.connect.modules.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.modules.admin.dto.AdminDtos.OverviewKpis;
import tn.esprit.connect.modules.admin.dto.AdminDtos.OverviewStats;
import tn.esprit.connect.modules.admin.repository.StatsRepository;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

/**
 * Assembles the rich dashboard payload from raw aggregations. Kept
 * separate from {@link AdminService} so the legacy /admin/stats endpoint
 * (used by the back-office landing) can keep its current shape while
 * /admin/stats/overview evolves independently.
 */
@Service
@RequiredArgsConstructor
public class StatsService {

    private static final int TIME_SERIES_MONTHS = 12;
    private static final int TOP_JOBS_LIMIT     = 5;
    private static final int TOP_COMPANIES_LIMIT = 5;
    private static final int TOP_MENTORS_LIMIT  = 5;

    private final StatsRepository statsRepository;

    @Transactional(readOnly = true)
    public OverviewStats overview() {
        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        Instant startOfThisMonth = now.withDayOfMonth(1)
                .withHour(0).withMinute(0).withSecond(0).withNano(0).toInstant();
        Instant startOfLastMonth = now.minusMonths(1).withDayOfMonth(1)
                .withHour(0).withMinute(0).withSecond(0).withNano(0).toInstant();
        Instant thirtyDaysAgo = now.minusDays(30).toInstant();

        long newThisMonth = statsRepository.countUsersCreatedBetween(startOfThisMonth, now.toInstant().plus(1, ChronoUnit.DAYS));
        long newLastMonth = statsRepository.countUsersCreatedBetween(startOfLastMonth, startOfThisMonth);
        Double changePct = changePercent(newThisMonth, newLastMonth);

        OverviewKpis kpis = new OverviewKpis(
                statsRepository.countAlive("users"),
                statsRepository.countUsersByStatus("ACTIVE"),
                statsRepository.countUsersByStatus("PENDING")
                        + statsRepository.countUsersByStatus("PENDING_APPROVAL"),
                statsRepository.countUsersByRole("ALUMNI"),
                statsRepository.countUsersByRole("MENTOR"),
                statsRepository.countUsersByRole("RECRUITER"),
                statsRepository.countAlive("job_offers"),
                statsRepository.countAlive("job_applications"),
                statsRepository.countApplicationsCreatedSince(startOfThisMonth),
                newThisMonth,
                statsRepository.countAlive("events"),
                statsRepository.countAlive("posts"),
                changePct,
                statsRepository.countActiveUsersSince(thirtyDaysAgo),
                statsRepository.avgApplicationsPerPosting()
        );

        return new OverviewStats(
                kpis,
                statsRepository.usersByRole(),
                statsRepository.usersByStatus(),
                statsRepository.usersByPromotionYear(),
                statsRepository.usersByCountry(),
                statsRepository.signupsByMonth(TIME_SERIES_MONTHS),
                statsRepository.applicationsByMonth(TIME_SERIES_MONTHS),
                statsRepository.topJobsByApplications(TOP_JOBS_LIMIT),
                statsRepository.topCompaniesByActivePostings(TOP_COMPANIES_LIMIT),
                statsRepository.topMentorsBySessions(TOP_MENTORS_LIMIT)
        );
    }

    /**
     * Returns the percentage change between {@code current} and {@code previous}.
     * Returns null when {@code previous} is zero — "infinite growth" isn't a
     * meaningful number to show on a KPI tile, so the UI renders it as "n/a".
     */
    private Double changePercent(long current, long previous) {
        if (previous == 0L) return null;
        double pct = ((double) (current - previous) / previous) * 100.0;
        return Math.round(pct * 10.0) / 10.0;
    }
}
