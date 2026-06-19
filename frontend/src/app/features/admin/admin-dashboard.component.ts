import {
  Component, computed, effect, ElementRef, inject,
  OnDestroy, OnInit, signal, viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// jsvectormap doesn't ship per-map types, so we treat the default import as
// `any` to keep the dashboard self-contained. The world-merc side-effect
// import registers the "world_merc" map identifier on the global jsVectorMap
// registry — without it, instantiation throws "Map world_merc not found".
import jsVectorMap from 'jsvectormap';
// Side-effect import: registers the "world_merc" map on the global
// jsVectorMap registry. The explicit .js suffix is required because
// jsvectormap's package.json export map ("./*": "./*") doesn't add it.
import 'jsvectormap/dist/maps/world-merc.js';

// ─── Types matching backend DTOs ────────────────────────────────────────────
interface OverviewKpis {
  totalUsers: number;
  activeUsers: number;
  pendingVerifications: number;
  alumniCount: number;
  mentorCount: number;
  recruiterCount: number;
  totalJobs: number;
  totalApplications: number;
  applicationsThisMonth: number;
  newUsersThisMonth: number;
  totalEvents: number;
  totalPosts: number;
  totalUsersChangePct: number | null;
  activeUsersLast30Days: number;
  avgApplicationsPerPosting: number;
}
interface TimeSeriesPoint { month: string; count: number; }
interface CategoryCount { label: string; count: number; }
interface TopJobRow { jobId: string; title: string; companyName: string; applicationCount: number; }
interface TopCompanyRow { companyId: string; companyName: string; activePostings: number; totalApplications: number; }
interface TopMentorRow { userId: string; displayName: string; sessionsCompleted: number; }
interface OverviewStats {
  kpis: OverviewKpis;
  usersByRole: CategoryCount[];
  usersByStatus: CategoryCount[];
  usersByPromotionYear: CategoryCount[];
  usersByCountry: CategoryCount[];
  signupsByMonth: TimeSeriesPoint[];
  applicationsByMonth: TimeSeriesPoint[];
  topJobsByApplications: TopJobRow[];
  topCompaniesByActivePostings: TopCompanyRow[];
  topMentorsBySessions: TopMentorRow[];
}

interface AreaSeries {
  /** SVG path for the filled area. */
  d: string;
  /** SVG path for the top stroke (sits on top of the area). */
  strokeD: string;
  /** Per-point circles and labels for hover. */
  points: { x: number; y: number; label: string; value: number; }[];
}

// ─── Chart geometry (inline SVG) ────────────────────────────────────────────
interface Bar { x: number; y: number; w: number; h: number; label: string; value: number; }
interface DonutSlice { d: string; color: string; label: string; value: number; pct: number; }

const CHART_W = 560;
const CHART_H = 180;
const CHART_PAD_X = 24;
const CHART_PAD_Y = 16;

// Signups area chart canvas. Larger than the small inline charts so axis
// labels have room; fixed viewBox keeps it readable when the panel is
// half-width (side-by-side with the map).
const AREA_W = 640;
const AREA_H = 220;
const AREA_PAD_X = 36;
const AREA_PAD_Y = 16;

/**
 * Discrete color buckets for the audience-location choropleth. Used
 * instead of jsvectormap's polynomial gradient because the polynomial
 * scale collapses small ranges (1–2 users) into a color
 * indistinguishable from the default fill. Sorted ascending; lookup
 * picks the first bucket where {@code count} fits {@code [min, max]}.
 */
const MAP_PALETTE: { min: number; max: number; color: string; label: string }[] = [
  { min: 1,  max: 1,        color: '#7dd3fc', label: '1' },
  { min: 2,  max: 5,        color: '#38bdf8', label: '2–5' },
  { min: 6,  max: 20,       color: '#0ea5e9', label: '6–20' },
  { min: 21, max: 75,       color: '#0369a1', label: '21–75' },
  { min: 76, max: Infinity, color: '#0c4a6e', label: '>75' },
];

/**
 * Free-text country names (as users typed them at signup) → ISO 3166-1
 * alpha-2 code. jsvectormap's world-merc map keys regions by alpha-2,
 * so this is the single source of truth for normalization. Add new
 * variants as they appear in the wild.
 */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'algeria': 'dz', 'argentina': 'ar', 'australia': 'au', 'austria': 'at',
  'belgium': 'be', 'brazil': 'br', 'canada': 'ca', 'china': 'cn',
  'czech republic': 'cz', 'czechia': 'cz', 'denmark': 'dk', 'egypt': 'eg',
  'finland': 'fi', 'france': 'fr', 'germany': 'de', 'greece': 'gr',
  'india': 'in', 'indonesia': 'id', 'ireland': 'ie', 'israel': 'il',
  'italy': 'it', 'japan': 'jp', 'jordan': 'jo', 'kuwait': 'kw',
  'lebanon': 'lb', 'libya': 'ly', 'luxembourg': 'lu', 'malaysia': 'my',
  'mexico': 'mx', 'morocco': 'ma', 'netherlands': 'nl', 'new zealand': 'nz',
  'nigeria': 'ng', 'norway': 'no', 'pakistan': 'pk', 'philippines': 'ph',
  'poland': 'pl', 'portugal': 'pt', 'qatar': 'qa', 'romania': 'ro',
  'russia': 'ru', 'russian federation': 'ru', 'saudi arabia': 'sa',
  'senegal': 'sn', 'singapore': 'sg', 'south africa': 'za',
  'south korea': 'kr', 'korea, south': 'kr', 'spain': 'es', 'sweden': 'se',
  'switzerland': 'ch', 'syria': 'sy', 'taiwan': 'tw', 'thailand': 'th',
  'tunisia': 'tn', 'turkey': 'tr', 'turkiye': 'tr', 'türkiye': 'tr',
  'ukraine': 'ua', 'united arab emirates': 'ae', 'uae': 'ae',
  'united kingdom': 'gb', 'uk': 'gb', 'great britain': 'gb',
  'united states': 'us', 'united states of america': 'us', 'usa': 'us',
  'vietnam': 'vn', 'yemen': 'ye',
};

const ROLE_COLORS: Record<string, string> = {
  STUDENT:   '#ef4444',
  ALUMNI:    '#22c55e',
  MENTOR:    '#3b82f6',
  RECRUITER: '#f59e0b',
  ADMIN:     '#a855f7',
};

@Component({
  selector: 'ec-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · STATS</p>
    <div class="flex items-end justify-between mb-8 gap-4 flex-wrap">
      <div>
        <h1 class="font-display text-3xl font-bold">Dashboard</h1>
        <p class="text-ink-300 text-sm mt-1">Engagement, hiring funnel, mentorship health.</p>
      </div>
      <div class="flex items-center gap-3 no-print">
        <button (click)="exportPdf()"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary
                       text-white text-sm font-semibold shadow-sm hover:bg-primary-dark
                       transition disabled:opacity-50 disabled:cursor-not-allowed"
                [disabled]="loading() || !stats()">
          <span class="text-base leading-none">⬇</span> Export PDF
        </button>
        <button (click)="refresh()"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2
                       border-primary text-primary text-sm font-semibold
                       hover:bg-primary hover:text-white transition disabled:opacity-50"
                [disabled]="loading()">
          <span class="text-base leading-none">↻</span>
          {{ loading() ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-6">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <ng-container *ngIf="stats() as s">
      <!-- Top KPI strip -->
      <section class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300">TOTAL USERS</p>
          <p class="font-display text-3xl font-bold mt-2">{{ s.kpis.totalUsers }}</p>
          <p class="text-xs mt-1"
             [class.text-green-400]="(s.kpis.totalUsersChangePct ?? 0) > 0"
             [class.text-primary]="(s.kpis.totalUsersChangePct ?? 0) < 0"
             [class.text-ink-300]="s.kpis.totalUsersChangePct === null || s.kpis.totalUsersChangePct === 0">
            {{ changeLabel(s.kpis.totalUsersChangePct) }} vs last month
          </p>
        </div>
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300">ACTIVE (LAST 30 DAYS)</p>
          <p class="font-display text-3xl font-bold mt-2">{{ s.kpis.activeUsersLast30Days }}</p>
          <p class="text-xs text-ink-300 mt-1">login · post · message · apply</p>
        </div>
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300">APPLICATIONS / POSTING</p>
          <p class="font-display text-3xl font-bold mt-2">
            {{ s.kpis.avgApplicationsPerPosting | number:'1.1-1' }}
          </p>
          <p class="text-xs text-ink-300 mt-1">average across all jobs</p>
        </div>
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300">PENDING VERIFICATIONS</p>
          <p class="font-display text-3xl font-bold mt-2 text-primary">
            {{ s.kpis.pendingVerifications }}
          </p>
          <p class="text-xs text-ink-300 mt-1">awaiting review</p>
        </div>
      </section>

      <!-- Donut + lifecycle bars -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">USER DISTRIBUTION BY ROLE</p>
          <h2 class="font-display text-lg font-bold mb-4">Audience mix</h2>
          <div class="flex items-center gap-6 flex-wrap">
            <svg viewBox="0 0 120 120" class="w-40 h-40 shrink-0">
              <g transform="translate(60,60)">
                <ng-container *ngIf="roleSlices().length > 0; else emptyDonut">
                  <path *ngFor="let sl of roleSlices()" [attr.d]="sl.d" [attr.fill]="sl.color"
                        stroke="#0a0a0a" stroke-width="1">
                    <title>{{ sl.label }} — {{ sl.value }} ({{ sl.pct }}%)</title>
                  </path>
                </ng-container>
                <ng-template #emptyDonut>
                  <circle r="48" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="14"/>
                </ng-template>
                <circle r="28" fill="#0a0a0a"/>
                <text text-anchor="middle" y="-2"
                      class="fill-current text-[8px] font-mono opacity-60">USERS</text>
                <text text-anchor="middle" y="10"
                      class="fill-current text-[12px] font-bold">{{ s.kpis.totalUsers }}</text>
              </g>
            </svg>
            <ul class="space-y-2 text-sm flex-1 min-w-[12rem]">
              <li *ngFor="let sl of roleSlices()" class="flex items-center gap-2">
                <span class="inline-block w-3 h-3 rounded-sm" [style.background]="sl.color"></span>
                <span class="font-mono">{{ sl.label }}</span>
                <span class="ml-auto text-ink-300">{{ sl.value }} · {{ sl.pct }}%</span>
              </li>
              <li *ngIf="roleSlices().length === 0" class="text-ink-300">No users yet.</li>
            </ul>
          </div>
        </div>

        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">USERS BY STATUS</p>
          <h2 class="font-display text-lg font-bold mb-4">Lifecycle</h2>
          <ul class="space-y-3">
            <li *ngFor="let r of s.usersByStatus">
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="font-mono">{{ r.label }}</span>
                <span class="text-ink-300">{{ r.count }} · {{ pct(r.count, s.kpis.totalUsers) }}%</span>
              </div>
              <div class="h-2 rounded bg-ink-900 overflow-hidden">
                <div class="h-full"
                     [class.bg-primary]="r.label === 'ACTIVE'"
                     [class.bg-yellow-500]="r.label === 'PENDING' || r.label === 'PENDING_APPROVAL'"
                     [class.bg-red-500]="r.label === 'SUSPENDED' || r.label === 'DELETED' || r.label === 'VERIFICATION_FAILED'"
                     [class.bg-ink-300]="r.label === 'DRAFT' || r.label === 'VERIFYING'"
                     [style.width.%]="pct(r.count, s.kpis.totalUsers)"></div>
              </div>
            </li>
            <li *ngIf="s.usersByStatus.length === 0" class="text-ink-300 text-sm">No users yet.</li>
          </ul>
        </div>
      </section>

      <!-- Registrations area chart + audience location, side by side -->
      <section class="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
        <!-- Monthly signups (smoothed area, with hover tooltip) -->
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <header class="flex items-end justify-between mb-4 flex-wrap gap-3">
            <div>
              <p class="text-xs font-mono text-ink-300">REGISTRATIONS OVER TIME</p>
              <h2 class="font-display text-lg font-bold">
                <ng-container *ngIf="areaHover() as hp; else areaTitleDefault">
                  <span class="text-ink-300 mr-2">{{ shortMonth(hp.label) }}</span>
                  <span class="text-primary font-mono">{{ hp.value }} new user(s)</span>
                </ng-container>
                <ng-template #areaTitleDefault>
                  Signups · last 12 months
                  <span class="text-ink-300 text-sm font-normal ml-2">
                    {{ totalIn(s.signupsByMonth) }} total
                  </span>
                </ng-template>
              </h2>
            </div>
          </header>
          <svg [attr.viewBox]="'0 0 ' + areaW + ' ' + (areaH + 28)"
               class="w-full h-64"
               (mousemove)="onAreaHover($event)"
               (mouseleave)="areaHoverIdx.set(null)">
            <!-- Y-axis gridlines + labels -->
            <g *ngFor="let t of areaYTicks()">
              <line [attr.x1]="areaPadX" [attr.x2]="areaW - 4"
                    [attr.y1]="t.y" [attr.y2]="t.y"
                    stroke="currentColor" stroke-opacity="0.08"/>
              <text [attr.x]="areaPadX - 4" [attr.y]="t.y + 3"
                    text-anchor="end"
                    class="fill-current text-[9px] font-mono opacity-60">
                {{ t.label }}
              </text>
            </g>
            <!-- Smoothed area fill -->
            <path *ngIf="signupArea() as a" [attr.d]="a.d"
                  fill="url(#signupGradient)" fill-opacity="0.35"/>
            <!-- Top stroke -->
            <path *ngIf="signupArea() as a" [attr.d]="a.strokeD"
                  fill="none" class="stroke-primary" stroke-width="2"/>
            <!-- Hover guideline + dot -->
            <ng-container *ngIf="areaHover() as hp">
              <line [attr.x1]="hp.x" [attr.x2]="hp.x"
                    [attr.y1]="areaPadY" [attr.y2]="areaH - areaPadY"
                    stroke="currentColor" stroke-opacity="0.3" stroke-dasharray="2 2"/>
              <circle [attr.cx]="hp.x" [attr.cy]="hp.y" r="4"
                      class="fill-primary" stroke="#0a0a0a" stroke-width="2"/>
            </ng-container>
            <!-- X-axis baseline -->
            <line [attr.x1]="areaPadX" [attr.x2]="areaW - 4"
                  [attr.y1]="areaH - areaPadY" [attr.y2]="areaH - areaPadY"
                  stroke="currentColor" stroke-opacity="0.25"/>
            <!-- X-axis labels (every other month to avoid crowding) -->
            <g *ngFor="let p of signupArea()?.points; let i = index">
              <text *ngIf="i % 2 === 1"
                    [attr.x]="p.x" [attr.y]="areaH + 14"
                    text-anchor="middle"
                    class="fill-current text-[9px] font-mono opacity-60">
                {{ shortMonth(p.label) }}
              </text>
            </g>
            <!-- Reusable gradient for the area fill. Color is hardcoded to
                 match the project palette's primary (red-500-ish); kept here
                 instead of class-driven because <stop> doesn't inherit
                 currentColor reliably across browsers. -->
            <defs>
              <linearGradient id="signupGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#ef4444" stop-opacity="0.6"/>
                <stop offset="100%" stop-color="#ef4444" stop-opacity="0"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        <!-- Audience location (jsvectormap choropleth) -->
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <header class="flex items-end justify-between mb-4 flex-wrap gap-3">
            <div>
              <p class="text-xs font-mono text-ink-300">AUDIENCE LOCATION</p>
              <h2 class="font-display text-lg font-bold">
                {{ mappedUserCount() }} users with known country
                <span *ngIf="unknownUserCount() > 0" class="text-ink-300 text-sm font-normal">
                  · {{ unknownUserCount() }} unknown
                </span>
              </h2>
            </div>
          </header>
          <!-- jsvectormap mounts its SVG inside this div via the ViewChild
               reference. Height is fixed so the map fills the panel even
               before the library finishes initialization. -->
          <div #mapEl class="w-full h-64"></div>
          <div class="flex items-center gap-1 mt-3 text-[10px] font-mono text-ink-300 flex-wrap">
            <span class="mr-2">Users:</span>
            <ng-container *ngFor="let b of mapLegend()">
              <span class="inline-block w-7 h-3 rounded-sm" [style.background]="b.color"></span>
              <span class="mr-2">{{ b.label }}</span>
            </ng-container>
          </div>
        </div>
      </section>

      <!-- Promotion year + recruiting companies -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5 lg:col-span-2">
          <p class="text-xs font-mono text-ink-300 mb-1">GRADUATION YEAR DISTRIBUTION</p>
          <h2 class="font-display text-lg font-bold mb-4">Cohort engagement</h2>
          <svg [attr.viewBox]="'0 0 ' + cohortW + ' ' + (cohortH + 36)" class="w-full h-80">
            <!-- Y-axis gridlines + count labels -->
            <g *ngFor="let t of cohortYTicks()">
              <line [attr.x1]="cohortPadX" [attr.x2]="cohortW - 8"
                    [attr.y1]="t.y" [attr.y2]="t.y"
                    stroke="currentColor" stroke-opacity="0.08"/>
              <text [attr.x]="cohortPadX - 6" [attr.y]="t.y + 3" text-anchor="end"
                    class="fill-current text-[10px] font-mono opacity-60">{{ t.label }}</text>
            </g>
            <!-- Baseline -->
            <line [attr.x1]="cohortPadX" [attr.x2]="cohortW - 8"
                  [attr.y1]="cohortH - cohortPadY" [attr.y2]="cohortH - cohortPadY"
                  stroke="currentColor" stroke-opacity="0.25"/>
            <!-- Bars -->
            <rect *ngFor="let b of cohortBars()" [attr.x]="b.x" [attr.y]="b.y"
                  [attr.width]="b.w" [attr.height]="b.h" rx="3" class="fill-primary">
              <title>{{ b.label }} — {{ b.value }}</title>
            </rect>
            <!-- Per-bar value (top) + year label (bottom) -->
            <g *ngFor="let b of cohortBars()">
              <text [attr.x]="b.x + b.w / 2" [attr.y]="b.y - 6" text-anchor="middle"
                    class="fill-current text-[11px] font-mono font-bold opacity-90">{{ b.value }}</text>
              <text [attr.x]="b.x + b.w / 2" [attr.y]="cohortH - cohortPadY + 18"
                    text-anchor="middle"
                    class="fill-current text-[11px] font-mono opacity-70">{{ b.label }}</text>
            </g>
          </svg>
          <p *ngIf="cohortBars().length === 0" class="text-ink-300 text-sm">
            No graduation data yet.
          </p>
        </div>

        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">TOP RECRUITING COMPANIES</p>
          <h2 class="font-display text-lg font-bold mb-4">Active job postings</h2>
          <ul class="space-y-3">
            <li *ngFor="let c of s.topCompaniesByActivePostings">
              <div class="flex items-center justify-between text-sm mb-1">
                <span class="truncate pr-2">{{ c.companyName }}</span>
                <span class="text-ink-300 font-mono shrink-0">
                  {{ c.activePostings }} open · {{ c.totalApplications }} apps
                </span>
              </div>
              <div class="h-2 rounded bg-ink-900 overflow-hidden">
                <div class="h-full bg-primary"
                     [style.width.%]="pct(c.activePostings, maxCompanyPostings())"></div>
              </div>
            </li>
            <li *ngIf="s.topCompaniesByActivePostings.length === 0"
                class="text-ink-300 text-sm">
              No company postings yet.
            </li>
          </ul>
        </div>
      </section>

      <!-- Top mentors / top jobs / apps-per-month -->
      <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">TOP MENTORS</p>
          <h2 class="font-display text-lg font-bold mb-4">By sessions completed</h2>
          <ol class="space-y-3">
            <li *ngFor="let m of s.topMentorsBySessions; let i = index"
                class="flex items-start gap-3">
              <span class="font-mono text-primary w-5 shrink-0">{{ i + 1 }}.</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{{ m.displayName }}</p>
              </div>
              <span class="text-sm font-mono text-primary shrink-0">
                {{ m.sessionsCompleted }}
              </span>
            </li>
            <li *ngIf="s.topMentorsBySessions.length === 0" class="text-ink-300 text-sm">
              No completed sessions yet.
            </li>
          </ol>
        </div>

        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">TOP JOB POSTINGS</p>
          <h2 class="font-display text-lg font-bold mb-4">Most applications</h2>
          <ol class="space-y-3">
            <li *ngFor="let j of s.topJobsByApplications; let i = index"
                class="flex items-start gap-3">
              <span class="font-mono text-primary w-5 shrink-0">{{ i + 1 }}.</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{{ j.title }}</p>
                <p class="text-xs text-ink-300 truncate">{{ j.companyName }}</p>
              </div>
              <span class="text-sm font-mono text-primary shrink-0">
                {{ j.applicationCount }}
              </span>
            </li>
            <li *ngIf="s.topJobsByApplications.length === 0" class="text-ink-300 text-sm">
              No applications yet.
            </li>
          </ol>
        </div>

        <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <p class="text-xs font-mono text-ink-300 mb-1">APPLICATIONS / MONTH</p>
          <h2 class="font-display text-lg font-bold mb-4">Last 12 months</h2>
          <svg [attr.viewBox]="'0 0 ' + chartW + ' ' + (chartH + 28)"
               class="w-full h-40" preserveAspectRatio="none">
            <line [attr.x1]="padX" [attr.x2]="chartW - padX"
                  [attr.y1]="chartH - padY" [attr.y2]="chartH - padY"
                  stroke="currentColor" stroke-opacity="0.15"/>
            <rect *ngFor="let b of applicationBars()" [attr.x]="b.x" [attr.y]="b.y"
                  [attr.width]="b.w" [attr.height]="b.h" rx="2" class="fill-primary">
              <title>{{ b.label }} — {{ b.value }}</title>
            </rect>
            <g *ngFor="let b of applicationBars(); let i = index">
              <text *ngIf="i % 2 === 1" [attr.x]="b.x + b.w / 2" [attr.y]="chartH + 12"
                    text-anchor="middle"
                    class="fill-current text-[9px] font-mono opacity-60">
                {{ shortMonth(b.label) }}
              </text>
            </g>
          </svg>
          <p class="text-xs text-ink-300 mt-2 font-mono">
            {{ totalIn(s.applicationsByMonth) }} total · +{{ s.kpis.applicationsThisMonth }} this month
          </p>
        </div>
      </section>
    </ng-container>

    <p *ngIf="!stats() && !error()" class="text-ink-300 text-sm font-mono">Loading dashboard…</p>
  `,
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  /**
   * Signal-based ViewChild. Unlike the decorator form, this re-fires when
   * the element appears/disappears — which matters because the map is
   * inside an *ngIf="stats() as s" block, so the div doesn't exist until
   * the overview HTTP call resolves.
   */
  private mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');
  private mapInstance: any | null = null;

  protected stats = signal<OverviewStats | null>(null);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  constructor() {
    // Reactive map lifecycle in one effect:
    //  1. Wait until the host div is in the DOM (mapEl signal becomes non-undefined).
    //  2. Create the jsvectormap instance lazily on first appearance.
    //  3. On every change to country data, push fills as ISO→hex (not counts).
    //     We compute the bucket colors ourselves because jsvectormap's
    //     polynomial normalizer collapses a 0–2 range into one near-baseline
    //     color, which is invisible against the dashboard's dark theme.
    effect(() => {
      const host = this.mapEl()?.nativeElement;
      const fills = this.countryFills();
      if (!host) return;
      if (!this.mapInstance) this.createMap(host);
      // setAttributes is the unscaled writer (just calls setStyle('fill', value));
      // setValues runs every value through Scale#getValue which expects numbers
      // when no `scale` is configured. We want raw hex strings, so bypass it.
      this.mapInstance.series.regions[0].setAttributes(fills);
    });
  }

  protected readonly chartW = CHART_W;
  protected readonly chartH = CHART_H;
  protected readonly padX = CHART_PAD_X;
  protected readonly padY = CHART_PAD_Y;

  protected readonly areaW = AREA_W;
  protected readonly areaH = AREA_H;
  protected readonly areaPadX = AREA_PAD_X;
  protected readonly areaPadY = AREA_PAD_Y;

  /** Hover state for the signups area chart (point index). */
  protected areaHoverIdx = signal<number | null>(null);


  protected applicationBars = computed(() => this.buildBars(this.stats()?.applicationsByMonth ?? []));
  protected promoBars = computed(() => this.buildCategoryBars(this.stats()?.usersByPromotionYear ?? []));

  // Dedicated geometry for the (now full-width) cohort chart — larger and
  // un-stretched so the year labels + per-bar counts stay crisp.
  protected readonly cohortW = 960;
  protected readonly cohortH = 300;
  protected readonly cohortPadX = 40;
  protected readonly cohortPadY = 32;

  protected cohortBars = computed<Bar[]>(() => {
    const points = this.stats()?.usersByPromotionYear ?? [];
    if (points.length === 0) return [];
    const max = Math.max(1, ...points.map(p => p.count));
    const usableW = this.cohortW - this.cohortPadX * 2;
    const usableH = this.cohortH - this.cohortPadY * 2;
    const slot = usableW / points.length;
    const barW = Math.max(8, Math.min(64, slot - 12));
    return points.map((p, i) => {
      const h = (p.count / max) * usableH;
      return {
        x: this.cohortPadX + slot * i + (slot - barW) / 2,
        y: this.cohortH - this.cohortPadY - h,
        w: barW, h, label: p.label, value: p.count,
      };
    });
  });

  protected cohortYTicks = computed(() => {
    const points = this.stats()?.usersByPromotionYear ?? [];
    const max = Math.max(1, ...points.map(p => p.count));
    const usableH = this.cohortH - this.cohortPadY * 2;
    const step = max / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const value = step * i;
      const y = this.cohortH - this.cohortPadY - (value / max) * usableH;
      return { y, label: String(Math.round(value)) };
    });
  });

  protected roleSlices = computed<DonutSlice[]>(() => {
    const list = this.stats()?.usersByRole ?? [];
    const total = list.reduce((s, r) => s + r.count, 0);
    if (total === 0) return [];
    let angle = -Math.PI / 2;
    const r = 48;
    const ir = 28;
    return list.map(item => {
      const sweep = (item.count / total) * Math.PI * 2;
      const a0 = angle, a1 = angle + sweep;
      angle = a1;
      const x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      const xi0 = Math.cos(a1) * ir, yi0 = Math.sin(a1) * ir;
      const xi1 = Math.cos(a0) * ir, yi1 = Math.sin(a0) * ir;
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}
                 L ${xi0} ${yi0} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z`;
      return {
        d, color: this.colorFor(item.label),
        label: item.label, value: item.count,
        pct: Math.round((item.count / total) * 1000) / 10,
      };
    });
  });

  /**
   * Smoothed signups area chart. Derived from {@code signupsByMonth} —
   * monthly buckets are gap-filled server-side, so the only work here is
   * projecting values into the SVG viewBox and routing them through the
   * cubic-Bézier smoother used elsewhere on the page.
   */
  protected signupArea = computed<AreaSeries | null>(() => {
    const pts = this.stats()?.signupsByMonth ?? [];
    if (pts.length === 0) return null;
    const max = Math.max(1, niceCeil(pts.reduce((m, p) => Math.max(m, p.count), 0)));
    const usableW = AREA_W - AREA_PAD_X - 4;
    const usableH = AREA_H - AREA_PAD_Y * 2;
    const dx = pts.length > 1 ? usableW / (pts.length - 1) : 0;
    const xAt = (i: number) => AREA_PAD_X + dx * i;
    const yAt = (v: number) => AREA_H - AREA_PAD_Y - (v / max) * usableH;
    const projected = pts.map((p, i) => [xAt(i), yAt(p.count)] as [number, number]);

    const strokeD = smoothPath(projected);
    const baselineY = AREA_H - AREA_PAD_Y;
    const lastX = projected[projected.length - 1][0];
    const firstX = projected[0][0];
    const d = `${strokeD} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;

    return {
      d, strokeD,
      points: pts.map((p, i) => ({
        x: projected[i][0],
        y: projected[i][1],
        label: p.month,
        value: p.count,
      })),
    };
  });

  protected areaYTicks = computed(() => {
    const pts = this.stats()?.signupsByMonth ?? [];
    const max = Math.max(1, niceCeil(pts.reduce((m, p) => Math.max(m, p.count), 0)));
    const usableH = AREA_H - AREA_PAD_Y * 2;
    const step = max / 4;
    return Array.from({ length: 5 }, (_, i) => {
      const value = step * i;
      const y = AREA_H - AREA_PAD_Y - (value / max) * usableH;
      return { y, label: String(Math.round(value)) };
    });
  });

  /** Resolves the hovered point into the absolute SVG x/y + month + value. */
  protected areaHover = computed(() => {
    const idx = this.areaHoverIdx();
    const area = this.signupArea();
    if (idx === null || !area || idx < 0 || idx >= area.points.length) return null;
    return area.points[idx];
  });

  // ─── Choropleth derivations ─────────────────────────────────────────────

  /**
   * Country counts keyed by ISO 3166-1 alpha-2 in <b>uppercase</b> —
   * jsvectormap's world_merc map registers regions with uppercase keys
   * (e.g. "FR", "GB"). Anything lowercase silently no-ops at setValues
   * time, which is exactly the bug we hit before.
   */
  protected countryCounts = computed<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const row of this.stats()?.usersByCountry ?? []) {
      const iso = COUNTRY_NAME_TO_ISO[row.label.toLowerCase()];
      if (iso) {
        const key = iso.toUpperCase();
        out[key] = (out[key] ?? 0) + row.count;
      }
    }
    return out;
  });

  /**
   * ISO → discrete bucket color, fed directly to jsvectormap's region
   * `values`. Skipping the library's polynomial scale lets us keep every
   * country with at least one user visibly distinct even when the total
   * range is tiny (1–2 users).
   */
  protected countryFills = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [iso, count] of Object.entries(this.countryCounts())) {
      out[iso] = MAP_PALETTE.find(b => count >= b.min && count <= b.max)!.color;
    }
    return out;
  });

  protected mappedUserCount = computed(() => {
    return Object.values(this.countryCounts()).reduce((a, b) => a + b, 0);
  });

  protected unknownUserCount = computed(() => {
    const rows = this.stats()?.usersByCountry ?? [];
    return rows
      .filter(r => r.label === 'Unknown' || !COUNTRY_NAME_TO_ISO[r.label.toLowerCase()])
      .reduce((s, r) => s + r.count, 0);
  });

  protected maxCompanyPostings = computed(() => {
    const cs = this.stats()?.topCompaniesByActivePostings ?? [];
    return cs.reduce((m, c) => Math.max(m, c.activePostings), 0);
  });

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.mapInstance?.destroy?.();
    this.mapInstance = null;
  }

  /**
   * Creates the jsvectormap instance on the given host div. Color scale
   * matches the screenshot reference: a 6-step blue ramp keyed on user
   * counts. The library handles tooltips, hover highlight, pan/zoom, and
   * SVG redraws on resize — none of which we want to reimplement.
   */
  private createMap(host: HTMLDivElement): void {
    this.mapInstance = new (jsVectorMap as any)({
      selector: host,
      map: 'world_merc',
      backgroundColor: 'transparent',
      regionStyle: {
        initial: { fill: '#1f2937', stroke: '#0a0a0a', strokeWidth: 0.4 },
        hover:   { fill: '#ef4444', fillOpacity: 0.85, cursor: 'pointer' },
      },
      // Single empty region series — we drive fills directly via
      // setValues(iso -> hex) from the constructor's effect, so no
      // `scale`/`normalizeFunction` is needed here.
      series: { regions: [{ attribute: 'fill', values: {} }] },
      onRegionTooltipShow: (_: Event, tooltip: any, code: string) => {
        const count = this.countryCounts()[code] ?? 0;
        tooltip.css({ backgroundColor: '#0a0a0a', color: '#fff', border: '1px solid rgba(239,68,68,0.4)' });
        tooltip.text(
          `${tooltip.text()} — ${count} user${count === 1 ? '' : 's'}`,
          true,
        );
      },
    });
  }

  /** Legend rows for the bucket palette — rendered below the map. */
  protected mapLegend = computed(() => MAP_PALETTE);

  /**
   * Translates pointer position over the signups SVG into the index of
   * the closest data point. Uses the viewBox width to keep the math
   * accurate regardless of the chart's current CSS width.
   */
  onAreaHover(ev: MouseEvent): void {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const relX = (ev.clientX - rect.left) / rect.width * AREA_W;
    const pts = this.signupArea()?.points ?? [];
    if (pts.length === 0) { this.areaHoverIdx.set(null); return; }
    let bestI = 0, bestDx = Infinity;
    pts.forEach((p, i) => {
      const dx = Math.abs(p.x - relX);
      if (dx < bestDx) { bestDx = dx; bestI = i; }
    });
    this.areaHoverIdx.set(bestI);
  }

  /**
   * Exports the dashboard to PDF via the browser's native print-to-PDF.
   * Tags <body> so the global print stylesheet (styles.scss) hides the
   * admin nav + toasts and forces the dark theme to render, then opens
   * the print dialog where the operator picks "Save as PDF". The body
   * class is removed once printing finishes (or is cancelled).
   */
  exportPdf(): void {
    const body = document.body;
    body.classList.add('printing-dashboard');
    const cleanup = () => {
      body.classList.remove('printing-dashboard');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<OverviewStats>(`${environment.apiUrl}/admin/stats/overview`).subscribe({
      next: s => { this.stats.set(s); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not load admin stats');
      },
    });
  }

  protected totalIn(points: TimeSeriesPoint[]): number {
    return points.reduce((sum, p) => sum + p.count, 0);
  }

  protected pct(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 1000) / 10;
  }

  protected changeLabel(p: number | null): string {
    if (p === null) return 'n/a';
    return `${p >= 0 ? '+' : ''}${p}%`;
  }

  protected colorFor(role: string): string {
    return ROLE_COLORS[role] ?? '#9ca3af';
  }

  protected shortMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' });
  }


  private maxOf(points: TimeSeriesPoint[]): number {
    return points.reduce((m, p) => Math.max(m, p.count), 0);
  }

  private buildBars(points: TimeSeriesPoint[]): Bar[] {
    if (points.length === 0) return [];
    const max = Math.max(1, this.maxOf(points));
    const usableW = CHART_W - CHART_PAD_X * 2;
    const usableH = CHART_H - CHART_PAD_Y * 2;
    const slot = usableW / points.length;
    const barW = Math.max(4, slot - 4);
    return points.map((p, i) => {
      const h = (p.count / max) * usableH;
      return {
        x: CHART_PAD_X + slot * i + (slot - barW) / 2,
        y: CHART_H - CHART_PAD_Y - h,
        w: barW, h, label: p.month, value: p.count,
      };
    });
  }

  private buildCategoryBars(points: CategoryCount[]): Bar[] {
    if (points.length === 0) return [];
    const max = Math.max(1, ...points.map(p => p.count));
    const usableW = CHART_W - CHART_PAD_X * 2;
    const usableH = CHART_H - CHART_PAD_Y * 2;
    const slot = usableW / points.length;
    const barW = Math.max(4, slot - 4);
    return points.map((p, i) => {
      const h = (p.count / max) * usableH;
      return {
        x: CHART_PAD_X + slot * i + (slot - barW) / 2,
        y: CHART_H - CHART_PAD_Y - h,
        w: barW, h, label: p.label, value: p.count,
      };
    });
  }
}

// ─── Top-level helpers (no class members so AOT can tree-shake) ─────────────

/**
 * Monotone cubic interpolation (Fritsch–Carlson). Returns an SVG cubic-
 * Bézier path that visits each input point smoothly without ever
 * overshooting beyond the data's min/max — which fixed our earlier
 * artifact where the signups area dipped below the X-axis between a 0
 * and a large value.
 *
 * The algorithm computes a slope at each point that's a weighted
 * harmonic mean of the neighboring segment slopes, then zeros it out
 * whenever the data isn't locally monotonic. Control points are placed
 * one-third of the way along the segment in the direction of that
 * constrained slope, which guarantees the curve stays inside the
 * polyline's bounding strip.
 */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }
  const n = points.length;

  // Segment slopes dx, dy, and dy/dx for each consecutive pair.
  const dx: number[] = new Array(n - 1);
  const dy: number[] = new Array(n - 1);
  const m: number[]  = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    dy[i] = points[i + 1][1] - points[i][1];
    m[i]  = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }

  // Tangent at each point — endpoints copy their neighbor's slope,
  // interior points use Fritsch–Carlson's weighted harmonic mean.
  const tangents: number[] = new Array(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // If the data turns (slopes change sign), force a flat tangent —
    // this is exactly what keeps the curve from overshooting at extrema.
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }

  // Emit cubic Béziers with control points 1/3 of the segment along the
  // local tangent direction.
  const out: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i][0] + dx[i] / 3;
    const c1y = points[i][1] + (tangents[i]     * dx[i]) / 3;
    const c2x = points[i + 1][0] - dx[i] / 3;
    const c2y = points[i + 1][1] - (tangents[i + 1] * dx[i]) / 3;
    out.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ` +
      `${c2x.toFixed(1)} ${c2y.toFixed(1)}, ` +
      `${points[i + 1][0]} ${points[i + 1][1]}`
    );
  }
  return out.join(' ');
}

/** Rounds {@code n} up to a "human-readable" axis max (1,2,5 × 10^k). */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const exp = Math.floor(Math.log10(n));
  const f = n / Math.pow(10, exp);
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}
