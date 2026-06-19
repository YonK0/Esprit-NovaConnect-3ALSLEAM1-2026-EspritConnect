import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { JobMatch, JobRecommendations, RecommendationsApi } from './recommendations.service';
import { RelativeTimePipe } from '../../shared/relative-time.pipe';
import { ToastService } from '../../shared/toast.service';
import { ProfileApi } from '../profile/profile.service';
import { AvatarComponent } from '../../shared/avatar.component';

interface JobOffer {
  id: string; title: string; description: string; type: string;
  location?: string; remote: boolean; companyName: string;
  postedById: string;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  hasApplied: boolean;
  applicationsCount: number;
  createdAt: string;
}

@Component({
  selector: 'ec-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RelativeTimePipe, AvatarComponent],
  template: `
    <div class="flex justify-between items-end gap-4 mb-6">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ JOBS &amp; INTERNSHIPS</p>
        <h1 class="font-display text-3xl font-bold">
          {{ jobs().length }} open roles across the network.
        </h1>
      </div>
      <div class="flex gap-2 shrink-0">
        <a routerLink="/jobs/mine/applications" class="btn-secondary">📨 My applications</a>
        <a *ngIf="canPost()" routerLink="/jobs/new" class="btn-primary">+ Post a job</a>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="flex flex-wrap gap-2 mb-6">
      <div class="card flex-1 !py-2.5 !px-4 flex items-center gap-2 min-w-[280px]">
        <span class="text-ink-500">🔍</span>
        <input class="flex-1 bg-transparent outline-none text-sm"
               [(ngModel)]="q" (ngModelChange)="search()"
               placeholder="Title or location..." />
      </div>
      <!-- Type selector -->
      <select class="card !py-2.5 !px-4 text-sm font-mono cursor-pointer
                     hover:border-primary/40 bg-white"
              [(ngModel)]="filterType" (ngModelChange)="search()">
        <option value="">All types</option>
        <option value="FULL_TIME">Full-time</option>
        <option value="INTERNSHIP">Internship</option>
        <option value="PART_TIME">Part-time</option>
        <option value="FREELANCE">Freelance</option>
      </select>

      <!-- Location free-text -->
      <input class="card !py-2.5 !px-4 text-sm font-mono outline-none w-44
                    hover:border-primary/40"
             [(ngModel)]="filterLocation" (ngModelChange)="search()"
             placeholder="Location..." />

      <!-- Remote toggle -->
      <label class="card !py-2.5 !px-4 text-sm font-mono inline-flex items-center gap-2
                    cursor-pointer hover:border-primary/40">
        <input type="checkbox" [(ngModel)]="filterRemote" (ngModelChange)="search()"
               class="accent-primary" />
        Remote only
      </label>

      <!-- Specialty filter — matches title + description (fuzzy text) -->
      <select class="card !py-2.5 !px-4 text-sm font-mono cursor-pointer
                     hover:border-primary/40 bg-white"
              [(ngModel)]="filterSpecialty" (ngModelChange)="search()">
        <option value="">All specialties</option>
        <option *ngFor="let s of specialties" [value]="s.value">{{ s.label }}</option>
      </select>
    </div>

    <div *ngIf="loading()" class="text-ink-500 text-sm">Loading...</div>

    <!-- Two-column: list + side detail -->
    <div class="grid lg:grid-cols-[1fr_360px] gap-4">
      <!-- Job list -->
      <div class="space-y-3">
        <p *ngIf="recsMeta()" class="text-xs font-mono mb-1 text-primary flex items-center gap-1">
          ▸ RECOMMENDED FOR YOU
          <span class="text-ink-400 normal-case">— ranked by your profile &amp; skills</span>
        </p>
        <article *ngFor="let j of jobs()"
                 (click)="selectJob(j)"
                 class="card cursor-pointer transition relative"
                 [class.border-primary]="selected()?.id === j.id"
                 [class.shadow-md]="selected()?.id === j.id"
                 [class.border-l-4]="selected()?.id === j.id">
          <div class="flex justify-between items-start gap-3">
            <div class="flex gap-3 flex-1 min-w-0">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center
                          font-display text-lg font-bold text-white shrink-0"
                   [style.background]="companyColor(j.companyName)">
                {{ initialOf(j.companyName) }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="font-bold text-base flex flex-wrap items-center gap-2">
                  <span class="truncate">{{ j.title }}</span>
                  <span *ngIf="matchScore(j) !== null" class="chip-red font-semibold"
                        [title]="matchReason(j)">
                    {{ matchScore(j) }}% MATCH
                  </span>
                  <span *ngIf="j.moderationStatus === 'PENDING'" class="chip-yellow">
                    PENDING
                  </span>
                </p>
                <p class="text-sm text-ink-600 truncate">
                  {{ j.companyName }} · {{ j.location || 'Remote' }}
                </p>
                <div class="flex flex-wrap gap-1 mt-2">
                  <span class="chip">{{ j.type | lowercase | titlecase }}</span>
                  <span *ngIf="j.remote" class="chip-red">REMOTE</span>
                  <span class="chip">Posted {{ j.createdAt | relTime }}</span>
                </div>
              </div>
            </div>
            <span class="text-xs text-ink-500 font-mono whitespace-nowrap">
              via {{ recruiterShort(j) }}
            </span>
          </div>

          <!-- Recommendations panel (recruiter/admin only) -->
          <!-- Loading state while fetching recommendations -->
          <section *ngIf="recsLoading()[j.id] && !recsFor()[j.id]"
                   (click)="$event.stopPropagation()"
                   class="mt-4 pt-4 border-t border-ink-300/40 flex items-center gap-2 text-xs text-ink-500">
            <span class="inline-block w-4 h-4 border-2 border-ink-300 border-t-primary
                         rounded-full animate-spin"></span>
            Finding matching candidates…
          </section>

          <section *ngIf="recsFor()[j.id] as recs"
                   (click)="$event.stopPropagation()"
                   class="mt-4 pt-4 border-t border-ink-300/40">
            <div class="flex items-center justify-between mb-3">
              <p class="text-xs font-mono text-primary">▸ RECOMMENDED CANDIDATES</p>
              <button (click)="closeRecs(j.id)" class="text-xs text-ink-500">× Close</button>
            </div>
            <p *ngIf="recs.fallbackReason" class="text-xs text-ink-500 mb-3 italic">
              {{ recs.fallbackReason }}
            </p>
            <ol class="space-y-2">
              <li *ngFor="let c of recs.candidates"
                  class="flex items-center gap-3 p-3 rounded-lg border border-ink-300/40">
                <ec-avatar [url]="c.avatarUrl" [name]="c.firstName + ' ' + c.lastName"
                           [size]="40" [openToWork]="!!c.openToWork"></ec-avatar>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm">
                    <a [routerLink]="['/profiles', c.userId]"
                       class="hover:text-primary">{{ c.firstName }} {{ c.lastName }}</a>
                  </p>
                  <p class="text-xs text-ink-600 truncate">{{ c.headline || c.email }}</p>
                  <div *ngIf="c.matchingSkills?.length" class="flex flex-wrap gap-1 mt-1">
                    <span *ngFor="let s of c.matchingSkills" class="chip-red">{{ s }}</span>
                  </div>
                </div>
                <p class="font-display text-xl font-bold shrink-0"
                   [class.text-primary]="c.matchScore >= 70"
                   [class.text-ink-500]="c.matchScore < 70">
                  {{ c.matchScore }}%
                </p>
              </li>
            </ol>
          </section>

          <button *ngIf="canSeeRecs(j) && !recsFor()[j.id]"
                  (click)="loadRecs(j); $event.stopPropagation()"
                  class="absolute bottom-3 right-3 text-xs px-3 py-1.5 rounded-lg
                         bg-primary text-white font-semibold hover:bg-primary-dark
                         disabled:opacity-50"
                  [disabled]="recsLoading()[j.id]">
            <span *ngIf="recsLoading()[j.id]"
                  class="inline-block w-3 h-3 mr-1 border-2 border-white/40 border-t-white
                         rounded-full animate-spin"></span>
            {{ recsLoading()[j.id] ? 'Loading…' : '✨ Recommendations' }}
          </button>
        </article>
      </div>

      <!-- Detail panel -->
      <aside class="card sticky top-6 self-start h-fit"
             *ngIf="selected() as s">
        <p class="text-xs font-mono text-primary mb-2">
          {{ s.companyName | uppercase }} · {{ (s.location || 'Remote') | uppercase }}
        </p>
        <h2 class="font-display text-2xl font-bold mb-1">{{ s.title }}</h2>
        <p class="text-xs text-ink-500 mb-4">
          {{ s.type | lowercase | titlecase }}<span *ngIf="s.remote"> · Hybrid</span>
        </p>

        <div *ngIf="matchScore(s) !== null" class="rounded-lg bg-red-50 border border-primary/30 p-3 mb-4">
          <p class="text-xs text-ink-700">
            <strong>Posted {{ s.createdAt | relTime }}</strong>
            <ng-container *ngIf="matchScore(s) !== null">
              — <strong>{{ matchScore(s) }}% match</strong> with your profile.
              <span *ngIf="matchReason(s)" class="italic">{{ matchReason(s) }}</span>
            </ng-container>
          </p>
        </div>

        <p class="text-sm text-ink-700 whitespace-pre-wrap mb-4 line-clamp-6">
          {{ s.description }}
        </p>

        <p class="text-xs font-mono text-primary mb-2">▸ REQUIREMENTS</p>
        <div class="flex flex-wrap gap-1 mb-5">
          <span *ngFor="let r of mockRequirements(s)" class="chip-red">{{ r }}</span>
        </div>

        <a routerLink="/profile/me"
           class="block w-full border-2 border-dashed border-ink-300 rounded-lg
                  p-4 text-center cursor-pointer hover:border-primary mb-3 no-underline">
          <span class="text-ink-500 text-sm" *ngIf="!myCvUrl()">⬆ Upload your CV in</span>
          <span class="text-primary font-semibold" *ngIf="!myCvUrl()"> profile editor</span>
          <span class="text-green-700 text-sm" *ngIf="myCvUrl()">✓ CV on file</span>
          <p class="text-xs text-ink-500 mt-1 font-mono">
            {{ myCvUrl() ? 'Click to manage in your profile' : 'PDF or Word, max 10 MB' }}
          </p>
        </a>

        <!-- Apply button — disabled & green-state once applied -->
        <button *ngIf="!s.hasApplied"
                (click)="applyToSelected()" class="btn-primary w-full"
                [disabled]="applying()">
          ⚡ {{ applying() ? 'Applying…' : 'One-click apply' + (myCvUrl() ? ' with CV on file' : '') }}
        </button>
        <div *ngIf="s.hasApplied"
             class="w-full text-center px-3 py-2 rounded-lg bg-green-50 text-green-700
                    text-sm font-semibold border border-green-300">
          ✓ Application submitted
        </div>

        <!-- Recruiters / admins: see who applied — prominent full-width action -->
        <a *ngIf="canSeeRecs(s) && s.applicationsCount > 0"
           [routerLink]="['/jobs', s.id, 'applications']"
           class="mt-3 flex items-center justify-between w-full px-4 py-3 rounded-lg
                  border border-ink-300/60 hover:border-primary hover:bg-primary/5
                  transition no-underline">
          <span class="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <span class="text-lg">📋</span> View applications
          </span>
          <span class="chip-red font-mono">
            {{ s.applicationsCount }} {{ s.applicationsCount === 1 ? 'candidate' : 'candidates' }}
          </span>
        </a>
        <button *ngIf="canSeeRecs(s) && s.applicationsCount === 0"
                (click)="noApplicationsYet()"
                class="mt-3 flex items-center justify-between w-full px-4 py-3 rounded-lg
                       border border-ink-300/60 hover:border-primary hover:bg-primary/5
                       transition text-left">
          <span class="flex items-center gap-2 text-sm font-semibold text-ink-800">
            <span class="text-lg">📋</span> View applications
          </span>
          <span class="chip font-mono text-ink-500">0 candidates</span>
        </button>

        <p class="text-xs text-ink-500 mt-2 text-center"
           *ngIf="!s.hasApplied">
          We'll attach your CV (if any) · {{ recruiterShort(s) }} will be notified.
          <span *ngIf="!myCvUrl()" class="text-primary">
            <a routerLink="/profile/me" class="font-semibold">Upload your CV first ↗</a>
          </span>
        </p>
      </aside>
    </div>

    <div *ngIf="!loading() && jobs().length === 0" class="card text-center text-ink-500">
      No matching jobs.
    </div>
  `
})
export class JobsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private recsApi = inject(RecommendationsApi);
  private toast = inject(ToastService);
  private profileApi = inject(ProfileApi);

  protected jobs = signal<JobOffer[]>([]);
  protected loading = signal(false);
  protected q = '';
  protected filterType: '' | 'FULL_TIME' | 'INTERNSHIP' | 'PART_TIME' | 'FREELANCE' = '';
  protected filterLocation = '';
  protected filterRemote = false;
  protected filterSpecialty = '';

  // For the specialty dropdown: `value` is what we search for in the
  // title/description (broad keyword that covers the field), `label` is
  // what we show. Generated lists hit more recruiter-written job copy
  // than just the ESPRIT 2-letter code.
  protected specialties = [
    { value: 'software',                            label: 'GL — Software' },
    { value: 'machine learning',                    label: 'IA — Machine Learning' },
    { value: 'data',                                label: 'IA — Data' },
    { value: 'network',                             label: 'RT — Networks & Telecom' },
    { value: 'embedded',                            label: 'INFOTRONIC — Embedded' },
    { value: 'civil',                               label: 'CIVIL — Civil engineering' },
    { value: 'mechanical',                          label: 'MECA — Mechanical' },
    { value: 'frontend',                            label: 'GL — Frontend' },
    { value: 'backend',                             label: 'GL — Backend' },
    { value: 'mobile',                              label: 'GL — Mobile' },
    { value: 'devops',                              label: 'GL — DevOps / Cloud' },
  ];
  protected selected = signal<JobOffer | null>(null);
  protected applying = signal(false);
  protected myCvUrl = signal<string | null>(null);

  protected recsFor = signal<Record<string, JobRecommendations>>({});
  protected recsLoading = signal<Record<string, boolean>>({});

  // Bug-1: real per-viewer match scores keyed by job id, plus the AI/fallback
  // label for the list header. Populated once on init (cached 5 min in the API).
  protected scoreMap = signal<Record<string, JobMatch>>({});
  protected recsMeta = signal<{ aiEnabled: boolean; fallbackReason?: string } | null>(null);
  /** Set once the user clicks a job so a late-arriving sort doesn't yank the
   *  detail panel away from their chosen role. */
  private userSelected = false;

  protected initialOf(name?: string | null): string {
    return (name ?? '').charAt(0).toUpperCase();
  }

  ngOnInit(): void {
    this.search();
    if (this.auth.isAuthenticated()) {
      this.profileApi.me().subscribe({
        next: p => this.myCvUrl.set(p.cvUrl ?? null),
        error: () => {}
      });
      this.loadMyJobMatches();
    }
  }

  /** Fetch the viewer's real job-match scores, then re-sort the list by score. */
  private loadMyJobMatches(): void {
    this.recsApi.forMe().subscribe({
      next: (r) => {
        const map: Record<string, JobMatch> = {};
        for (const m of r.matches) map[m.jobId] = m;
        this.scoreMap.set(map);
        this.recsMeta.set({ aiEnabled: r.aiEnabled, fallbackReason: r.fallbackReason });
        this.applyMatchSort();
        if (!this.userSelected) this.selected.set(this.jobs()[0] ?? null);
      },
      error: () => {}   // best-effort — list still works without scores
    });
  }

  /** Sort the current list by match score desc; jobs with no score sink to the
   *  bottom (Array.sort is stable, so createdAt order is preserved within ties). */
  private applyMatchSort(): void {
    const map = this.scoreMap();
    if (Object.keys(map).length === 0) return;
    const sorted = [...this.jobs()].sort((a, b) =>
      (map[b.id]?.matchScore ?? -1) - (map[a.id]?.matchScore ?? -1));
    this.jobs.set(sorted);
  }

  onFilterSoon(label: string): void {
    this.toast.soon(label);
  }

  applyToSelected(): void {
    const job = this.selected();
    if (!job) return;
    this.applying.set(true);
    this.http.post(`${environment.apiUrl}/jobs/${job.id}/apply`, {
      cvUrl: this.myCvUrl(),
      coverLetter: ''
    }).subscribe({
      next: () => {
        this.applying.set(false);
        // Optimistically flip hasApplied + bump count so the UI reflects
        // success without an extra round trip.
        const updated: JobOffer = {
          ...job, hasApplied: true,
          applicationsCount: (job.applicationsCount ?? 0) + 1
        };
        this.selected.set(updated);
        this.jobs.update(arr => arr.map(j => j.id === job.id ? updated : j));
        this.toast.success(`Applied to ${job.title} — the recruiter has been notified.`);
      },
      error: (err) => {
        this.applying.set(false);
        if (err.status === 400) {
          this.toast.error(err.error?.message ?? 'You may have already applied to this job.');
          // If backend says "Already applied", flip the flag — likely a stale list.
          if ((err.error?.message ?? '').toLowerCase().includes('already')) {
            const updated = { ...job, hasApplied: true };
            this.selected.set(updated);
            this.jobs.update(arr => arr.map(j => j.id === job.id ? updated : j));
          }
        } else if (err.status === 401) {
          this.toast.error('Please log in to apply.');
        } else {
          this.toast.error('Could not submit application.');
        }
      }
    });
  }

  selectJob(j: JobOffer): void { this.userSelected = true; this.selected.set(j); }

  /** Zero-applications state of the "View applications" action. */
  noApplicationsYet(): void { this.toast.info('No applications yet.'); }

  canPost(): boolean {
    const r = this.auth.currentUser()?.role;
    return r === 'RECRUITER' || r === 'ADMIN';
  }

  canSeeRecs(j: JobOffer): boolean {
    const u = this.auth.currentUser();
    if (!u) return false;
    if (u.role === 'ADMIN') return true;
    return u.role === 'RECRUITER' && u.userId === j.postedById;
  }

  search(): void {
    this.loading.set(true);
    const params = new URLSearchParams();
    params.set('q', this.q);
    params.set('size', '20');
    if (this.filterType) params.set('type', this.filterType);
    if (this.filterLocation.trim()) params.set('location', this.filterLocation.trim());
    if (this.filterRemote) params.set('remoteOnly', 'true');
    if (this.filterSpecialty) params.set('specialty', this.filterSpecialty);
    this.http.get<{ content: JobOffer[] }>(
      `${environment.apiUrl}/jobs?${params.toString()}`
    ).subscribe({
      next: (r) => {
        const list = r.content ?? [];
        this.userSelected = false;
        this.jobs.set(list);
        this.applyMatchSort();
        this.selected.set(this.jobs()[0] ?? null);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); }
    });
  }

  loadRecs(j: JobOffer): void {
    if (this.recsLoading()[j.id]) return;
    this.recsLoading.update(s => ({ ...s, [j.id]: true }));
    this.recsApi.forJob(j.id).subscribe({
      next: (recs) => {
        this.recsFor.update(s => ({ ...s, [j.id]: recs }));
        this.recsLoading.update(s => ({ ...s, [j.id]: false }));
      },
      error: (err) => {
        this.recsLoading.update(s => ({ ...s, [j.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not load recommendations — is Ollama running?');
      }
    });
  }

  closeRecs(jobId: string): void {
    this.recsFor.update(s => { const n = { ...s }; delete n[jobId]; return n; });
  }

  /** Stable per-company gradient so the same company always uses the same color. */
  companyColor(name: string | undefined): string {
    if (!name) return '#6E6E73';
    const palette = ['#1F6FEB', '#9A4DFF', '#0D8A7E', '#7A4B2A', '#B0413E', '#46243A', '#3D4514'];
    let hash = 0;
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  /**
   * Real per-viewer match score from the AI endpoint (Ollama, heuristic
   * fallback). Returns null when this job wasn't in the scored pool — the
   * template then hides the chip and the job sorts to the bottom.
   */
  matchScore(j: JobOffer): number | null {
    return this.scoreMap()[j.id]?.matchScore ?? null;
  }

  /** The AI's one-line justification for the match, shown as a tooltip. */
  matchReason(j: JobOffer): string {
    return this.scoreMap()[j.id]?.reason ?? '';
  }

  recruiterShort(j: JobOffer): string {
    return j.postedById.slice(0, 6).toUpperCase() + '…';
  }

  /** Extract requirements heuristically until the entity has a real field. */
  mockRequirements(j: JobOffer): string[] {
    const out: string[] = [];
    const t = (j.title + ' ' + (j.description ?? '')).toLowerCase();
    if (t.includes('ml') || t.includes('machine learning')) out.push('5+ yr ML', 'PyTorch');
    if (t.includes('python')) out.push('Python');
    if (t.includes('sql'))    out.push('SQL');
    if (t.includes('recsys')) out.push('RecSys');
    if (t.includes('system') || t.includes('design')) out.push('Systems Design');
    return out.length ? out : ['Senior', 'Communication', 'Ownership'];
  }
}
