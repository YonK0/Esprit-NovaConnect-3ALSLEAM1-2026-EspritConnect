import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface OverviewKpis {
  totalUsers: number;
  pendingVerifications: number;
  totalApplications: number;
  applicationsThisMonth: number;
  totalUsersChangePct: number | null;
  newUsersThisMonth: number;
}
interface OverviewResp {
  kpis: OverviewKpis;
}

interface Tile {
  label: string;
  value: number | string;
  hint?: string;
  link?: string;
  accent?: boolean;
}

/**
 * Lightweight landing page for /admin. Shows a welcome line, four
 * orientation tiles, and quick links to the sections an admin will
 * typically need on day one. The detailed dashboard with all charts
 * lives at /admin/stats.
 */
@Component({
  selector: 'ec-admin-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · OVERVIEW</p>
    <h1 class="font-display text-3xl font-bold">Welcome back, admin</h1>
    <p class="text-ink-300 mt-1 mb-8">
      Quick orientation. For the full dashboard, head to
      <a routerLink="/admin/stats" class="text-primary hover:underline">Stats</a>.
    </p>

    <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-6">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
      <a *ngFor="let t of tiles()" [routerLink]="t.link"
         class="block bg-ink-900/60 border border-primary/20 rounded-xl p-5 hover:border-primary/60 transition">
        <p class="text-xs font-mono text-ink-300">{{ t.label }}</p>
        <p class="font-display text-3xl font-bold mt-2" [class.text-primary]="t.accent">
          {{ t.value }}
        </p>
        <p *ngIf="t.hint" class="text-xs text-ink-300 mt-1">{{ t.hint }}</p>
      </a>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <a routerLink="/admin/verifications"
         class="block bg-ink-900/60 border border-primary/20 rounded-xl p-5 hover:border-primary/60 transition">
        <p class="text-xs font-mono text-primary mb-2">▸ TASK</p>
        <h2 class="font-display text-lg font-bold mb-1">Review verifications</h2>
        <p class="text-sm text-ink-300">Approve or reject pending signups.</p>
      </a>
      <a routerLink="/admin/moderation"
         class="block bg-ink-900/60 border border-primary/20 rounded-xl p-5 hover:border-primary/60 transition">
        <p class="text-xs font-mono text-primary mb-2">▸ TASK</p>
        <h2 class="font-display text-lg font-bold mb-1">Moderate content</h2>
        <p class="text-sm text-ink-300">Posts, jobs, and groups awaiting review.</p>
      </a>
      <a routerLink="/admin/audit"
         class="block bg-ink-900/60 border border-primary/20 rounded-xl p-5 hover:border-primary/60 transition">
        <p class="text-xs font-mono text-primary mb-2">▸ TRACE</p>
        <h2 class="font-display text-lg font-bold mb-1">Audit log</h2>
        <p class="text-sm text-ink-300">Recent admin actions and their context.</p>
      </a>
    </section>

    <p *ngIf="loading()" class="text-ink-300 text-sm font-mono mt-6">Loading…</p>
  `,
})
export class AdminOverviewComponent implements OnInit {
  private http = inject(HttpClient);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected kpis = signal<OverviewKpis | null>(null);

  protected tiles = computed<Tile[]>(() => {
    const k = this.kpis();
    if (!k) return [];
    const change = k.totalUsersChangePct;
    const hint = change == null
      ? `+${k.newUsersThisMonth} this month`
      : `${change >= 0 ? '+' : ''}${change}% vs last month`;
    return [
      { label: 'TOTAL USERS', value: k.totalUsers, hint, link: '/admin/stats' },
      { label: 'PENDING VERIFICATIONS', value: k.pendingVerifications, accent: true,
        link: '/admin/verifications', hint: 'awaiting review' },
      { label: 'APPLICATIONS', value: k.totalApplications,
        hint: `+${k.applicationsThisMonth} this month`, link: '/admin/stats' },
      { label: 'SEE EVERYTHING', value: '↗', hint: 'full dashboard', link: '/admin/stats' },
    ];
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.http.get<OverviewResp>(`${environment.apiUrl}/admin/stats/overview`).subscribe({
      next: r => { this.kpis.set(r.kpis); this.loading.set(false); },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not load admin overview');
      },
    });
  }
}
