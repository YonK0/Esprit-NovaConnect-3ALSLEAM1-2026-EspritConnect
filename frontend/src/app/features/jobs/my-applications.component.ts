import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface MyApplication {
  id: string; jobOfferId: string; applicantId: string;
  applicantEmail: string; applicantName: string;
  cvUrl?: string; coverLetter?: string;
  status: 'NEW' | 'REVIEWING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
  createdAt: string;
  jobTitle?: string;
  companyName?: string;
}

const STATUS_STYLE: Record<MyApplication['status'], { bg: string; label: string }> = {
  NEW:       { bg: 'bg-ink-100 text-ink-700',   label: 'New' },
  REVIEWING: { bg: 'bg-amber-100 text-amber-800', label: 'Under review' },
  INTERVIEW: { bg: 'bg-blue-100 text-blue-800',   label: 'Interview' },
  OFFER:     { bg: 'bg-violet-100 text-violet-800', label: 'Offer extended' },
  HIRED:     { bg: 'bg-green-100 text-green-800', label: 'Hired ✓' },
  REJECTED:  { bg: 'bg-red-50 text-primary',      label: 'Not selected' },
};

@Component({
  selector: 'ec-my-applications',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  template: `
    <div class="flex items-end justify-between mb-6 gap-4">
      <div>
        <p class="text-xs font-mono text-primary mb-1">▸ MY APPLICATIONS</p>
        <h1 class="font-display text-3xl font-bold">Job applications</h1>
        <p class="text-sm text-ink-600">
          {{ applications().length }} total
          <span *ngIf="activeCount() > 0"> · {{ activeCount() }} still active</span>
        </p>
      </div>
      <a routerLink="/jobs" class="btn-secondary">Browse jobs →</a>
    </div>

    <div *ngIf="loading()" class="card text-center text-ink-500">Loading…</div>

    <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3 mb-4">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <div *ngIf="!loading() && applications().length === 0 && !error()"
         class="card text-center py-12">
      <p class="text-4xl mb-2">📭</p>
      <p class="text-ink-700 font-semibold">No applications yet</p>
      <p class="text-sm text-ink-500 mb-4">When you apply to a job, it'll show up here.</p>
      <a routerLink="/jobs" class="btn-primary inline-block">Browse jobs</a>
    </div>

    <div class="space-y-3">
      <article *ngFor="let a of applications()" class="card hover:shadow-md transition-shadow">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center
                      justify-center text-xl shrink-0">💼</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="min-w-0">
                <h3 class="font-bold text-ink-900 truncate">
                  {{ a.jobTitle || 'Job offer' }}
                </h3>
                <p class="text-sm text-ink-600">{{ a.companyName || '—' }}</p>
              </div>
              <span class="text-xs font-mono px-2 py-1 rounded shrink-0"
                    [ngClass]="statusStyle(a.status).bg">
                {{ statusStyle(a.status).label }}
              </span>
            </div>
            <p class="text-xs text-ink-500 mt-2">
              Applied {{ a.createdAt | date:'mediumDate' }}
              <span *ngIf="a.cvUrl"> · CV attached</span>
            </p>
            <p *ngIf="a.coverLetter"
               class="text-sm text-ink-700 mt-2 line-clamp-2 whitespace-pre-wrap">
              {{ a.coverLetter }}
            </p>
          </div>
        </div>
      </article>
    </div>
  `
})
export class MyApplicationsComponent implements OnInit {
  private http = inject(HttpClient);

  protected applications = signal<MyApplication[]>([]);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  protected activeCount = computed(() =>
    this.applications().filter(a =>
      a.status !== 'REJECTED' && a.status !== 'HIRED').length);

  ngOnInit(): void {
    this.loading.set(true);
    this.http.get<MyApplication[]>(`${environment.apiUrl}/jobs/applications/mine`)
      .subscribe({
        next: list => { this.applications.set(list ?? []); this.loading.set(false); },
        error: err => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Could not load your applications.');
        }
      });
  }

  statusStyle(s: MyApplication['status']) { return STATUS_STYLE[s]; }
}
