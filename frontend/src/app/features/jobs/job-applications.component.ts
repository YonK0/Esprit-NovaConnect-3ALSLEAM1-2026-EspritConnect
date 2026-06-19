import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface JobApplication {
  id: string; jobOfferId: string; applicantId: string;
  applicantEmail: string; applicantName: string;
  cvUrl?: string; coverLetter?: string;
  status: 'NEW' | 'REVIEWING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
  createdAt: string;
}

interface JobOffer {
  id: string; title: string; companyName: string;
}

const STATUSES: JobApplication['status'][] =
  ['NEW', 'REVIEWING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

@Component({
  selector: 'ec-job-applications',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  template: `
    <div class="flex items-end justify-between mb-6 gap-4">
      <div>
        <p class="text-xs font-mono text-primary mb-1">▸ JOB APPLICATIONS</p>
        <h1 class="font-display text-3xl font-bold">{{ job()?.title ?? '…' }}</h1>
        <p *ngIf="job() as j" class="text-sm text-ink-600">
          {{ j.companyName }} · {{ applications().length }} application(s)
        </p>
      </div>
      <a routerLink="/jobs" class="btn-secondary">← Back to jobs</a>
    </div>

    <div *ngIf="loading()" class="card text-center text-ink-500">Loading…</div>

    <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3 mb-4">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <p *ngIf="!loading() && applications().length === 0 && !error()"
       class="card text-center text-ink-500">
      No applications yet.
    </p>

    <div class="space-y-3">
      <article *ngFor="let a of applications()" class="card">
        <div class="flex items-start gap-3">
          <div class="w-12 h-12 rounded-full bg-primary text-white flex items-center
                      justify-center font-mono shrink-0">
            {{ initials(a.applicantName || a.applicantEmail) }}
          </div>
          <div class="flex-1 min-w-0">
            <a [routerLink]="['/profiles', a.applicantId]"
               class="font-bold hover:text-primary block">
              {{ a.applicantName || a.applicantEmail }}
            </a>
            <p class="text-xs text-ink-500">{{ a.applicantEmail }}</p>
            <p class="text-xs text-ink-500 mt-1">
              Applied {{ a.createdAt | date:'short' }}
            </p>
            <p *ngIf="a.coverLetter" class="text-sm text-ink-700 mt-2 whitespace-pre-wrap">
              {{ a.coverLetter }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <a *ngIf="a.cvUrl" [href]="a.cvUrl" target="_blank"
                 class="btn-secondary text-xs">⬇ View CV</a>
              <select class="bg-white border border-ink-300 rounded px-2 py-1 text-xs font-mono"
                      [value]="a.status"
                      [disabled]="updating()[a.id]"
                      (change)="updateStatus(a, $any($event.target).value)">
                <option *ngFor="let s of statuses" [value]="s">{{ s }}</option>
              </select>
              <span *ngIf="updating()[a.id]" class="text-xs text-ink-500">saving…</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  `
})
export class JobApplicationsComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  protected applications = signal<JobApplication[]>([]);
  protected job = signal<JobOffer | null>(null);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected updating = signal<Record<string, boolean>>({});
  protected statuses = STATUSES;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.loading.set(true);
    this.http.get<JobOffer>(`${environment.apiUrl}/jobs/${id}`)
      .subscribe({ next: j => this.job.set(j), error: () => {} });
    this.http.get<JobApplication[]>(`${environment.apiUrl}/jobs/${id}/applications`)
      .subscribe({
        next: list => { this.applications.set(list ?? []); this.loading.set(false); },
        error: (err) => {
          this.loading.set(false);
          if (err.status === 403) {
            this.error.set('Only the recruiter who posted this job can view applications.');
          } else {
            this.error.set(err?.error?.message ?? 'Could not load applications.');
          }
        }
      });
  }

  updateStatus(a: JobApplication, status: JobApplication['status']): void {
    if (status === a.status) return;
    this.updating.update(s => ({ ...s, [a.id]: true }));
    this.http.patch<JobApplication>(
      `${environment.apiUrl}/jobs/applications/${a.id}/status`, { status }
    ).subscribe({
      next: () => {
        this.updating.update(s => ({ ...s, [a.id]: false }));
        this.applications.update(arr => arr.map(x =>
          x.id === a.id ? { ...x, status } : x));
        this.toast.success(`Status set to ${status}`);
      },
      error: (err) => {
        this.updating.update(s => ({ ...s, [a.id]: false }));
        this.toast.error(err?.error?.message ?? 'Status update failed.');
      }
    });
  }

  initials(s: string): string {
    return s.slice(0, 2).toUpperCase();
  }
}
