import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface AdminJobSummary {
  id: string; title: string; companyName: string;
  postedByEmail: string; applicationsCount: number; createdAt: string;
}

interface ApplicationRow {
  id: string; applicantEmail: string; applicantName: string;
  cvUrl?: string | null; coverLetter?: string | null;
  status: string; createdAt: string;
}

interface RecruiterBundle {
  jobId: string; jobTitle: string;
  recruiterEmail: string; recruiterFirstName?: string | null;
  applications: ApplicationRow[];
}

interface EmailResult { sentAt: string; attachmentCount: number; recruiterEmail: string; }

/**
 * Admin "Job postings & applications" console (Task-3). Pick an approved job,
 * inspect every application, then compose + send a consolidated email to the
 * recruiter with all CVs + a summary CSV attached. Sent synchronously so the
 * admin gets immediate confirmation of what was delivered.
 */
@Component({
  selector: 'ec-admin-jobs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · JOB POSTINGS &amp; APPLICATIONS</p>
    <h1 class="font-display text-3xl font-bold mb-6">Job postings &amp; applications</h1>

    <div class="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
      <!-- ─────────── Job list ─────────── -->
      <section class="bg-ink-900/60 border border-primary/20 rounded-xl p-5 self-start">
        <p class="text-xs font-mono text-ink-300 mb-3">▸ APPROVED JOBS</p>
        <p *ngIf="loading()" class="text-ink-300 text-sm">Loading…</p>
        <p *ngIf="!loading() && jobs().length === 0" class="text-ink-300 text-sm">
          No approved jobs yet.
        </p>
        <ul class="space-y-2">
          <li *ngFor="let j of jobs()">
            <button (click)="selectJob(j)"
                    class="w-full text-left px-3 py-2.5 rounded-lg border transition"
                    [class.border-primary]="selected()?.id === j.id"
                    [class.bg-primary]="selected()?.id === j.id"
                    [class.bg-opacity-10]="selected()?.id === j.id"
                    [class.border-ink-700]="selected()?.id !== j.id">
              <p class="font-semibold text-sm truncate">{{ j.title }}</p>
              <p class="text-xs text-ink-300 truncate">{{ j.companyName }} · {{ j.postedByEmail }}</p>
              <p class="text-xs font-mono mt-1"
                 [class.text-primary]="j.applicationsCount > 0"
                 [class.text-ink-400]="j.applicationsCount === 0">
                {{ j.applicationsCount }} {{ j.applicationsCount === 1 ? 'candidate' : 'candidates' }}
                · {{ j.createdAt | date:'mediumDate' }}
              </p>
            </button>
          </li>
        </ul>
      </section>

      <!-- ─────────── Detail / composer ─────────── -->
      <section class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
        <p *ngIf="!selected()" class="text-ink-300 text-sm">
          ← Select a job to see its applications.
        </p>

        <ng-container *ngIf="selected() as s">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div class="min-w-0">
              <h2 class="font-display text-xl font-bold truncate">{{ s.title }}</h2>
              <p class="text-xs text-ink-300">
                {{ s.companyName }} · recruiter <span class="font-mono">{{ s.postedByEmail }}</span>
              </p>
            </div>
            <button (click)="openComposer()"
                    [disabled]="bundleLoading() || !bundle()"
                    class="shrink-0 px-4 py-2 rounded bg-primary text-white font-semibold
                           hover:bg-primary-dark disabled:opacity-50 text-sm">
              📧 Email recruiter
            </button>
          </div>

          <p *ngIf="bundleLoading()" class="text-ink-300 text-sm">Loading applications…</p>

          <!-- Applications table -->
          <div *ngIf="bundle() as b" class="overflow-x-auto">
            <p *ngIf="b.applications.length === 0" class="text-ink-300 text-sm">
              No applications for this job yet.
            </p>
            <table *ngIf="b.applications.length > 0" class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs font-mono text-ink-400 border-b border-ink-700">
                  <th class="py-2 pr-3">Candidate</th>
                  <th class="py-2 pr-3">Applied</th>
                  <th class="py-2 pr-3">Status</th>
                  <th class="py-2 pr-3">CV</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let a of b.applications" class="border-b border-ink-800/60">
                  <td class="py-2 pr-3">
                    <p class="font-semibold">{{ a.applicantName }}</p>
                    <p class="text-xs text-ink-400 font-mono">{{ a.applicantEmail }}</p>
                  </td>
                  <td class="py-2 pr-3 text-xs text-ink-300">{{ a.createdAt | date:'mediumDate' }}</td>
                  <td class="py-2 pr-3">
                    <span class="text-xs font-mono px-2 py-0.5 rounded bg-ink-800 text-ink-200">
                      {{ a.status }}
                    </span>
                  </td>
                  <td class="py-2 pr-3">
                    <a *ngIf="a.cvUrl" [href]="a.cvUrl" target="_blank" rel="noopener"
                       class="text-primary hover:underline text-xs">View CV ↗</a>
                    <span *ngIf="!a.cvUrl" class="text-ink-500 text-xs">no CV</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ─────────── Composer dialog ─────────── -->
          <div *ngIf="composing() && bundle() as b"
               class="mt-5 pt-5 border-t border-primary/20">
            <p class="text-xs font-mono text-primary mb-3">▸ COMPOSE EMAIL TO RECRUITER</p>

            <label class="block text-xs font-mono text-ink-300 mb-1">To</label>
            <input [value]="b.recruiterEmail" readonly
                   class="w-full bg-ink-900 border border-ink-700 rounded px-3 py-2 text-sm
                          mb-4 font-mono text-ink-300" />

            <label class="block text-xs font-mono text-ink-300 mb-1">Subject</label>
            <input [(ngModel)]="form.subject" name="subject"
                   class="w-full bg-ink-900 border border-primary/30 rounded px-3 py-2 text-sm mb-4" />

            <label class="block text-xs font-mono text-ink-300 mb-1">Message</label>
            <textarea [(ngModel)]="form.body" name="body" rows="5"
                      class="w-full bg-ink-900 border border-primary/30 rounded px-3 py-2 text-sm
                             mb-4 font-mono"></textarea>

            <p class="text-xs font-mono text-ink-300 mb-2">
              ▸ ATTACHMENTS ({{ cvCount(b) + 1 }})
            </p>
            <ul class="text-xs text-ink-300 font-mono mb-4 space-y-1 max-h-40 overflow-y-auto">
              <li *ngFor="let a of b.applications">
                <span *ngIf="a.cvUrl">📎 CV — {{ a.applicantName }}</span>
                <span *ngIf="!a.cvUrl" class="text-ink-500">— {{ a.applicantName }} has no CV</span>
              </li>
              <li class="text-green-400">📊 {{ csvName(b) }}</li>
            </ul>

            <div class="flex items-center gap-3">
              <button (click)="send()" [disabled]="sending() || !form.subject || !form.body"
                      class="px-4 py-2 rounded bg-primary text-white font-semibold
                             hover:bg-primary-dark disabled:opacity-50 text-sm">
                {{ sending() ? 'Sending…' : 'Send to recruiter' }}
              </button>
              <button (click)="composing.set(false)" [disabled]="sending()"
                      class="px-4 py-2 rounded border border-ink-700 text-ink-300
                             hover:border-ink-500 text-sm">
                Cancel
              </button>
            </div>

            <p *ngIf="result() as r" class="mt-4 text-xs font-mono text-green-400">
              ✓ Sent to {{ r.recruiterEmail }} with {{ r.attachmentCount }} attachment(s).
            </p>
            <p *ngIf="error()" class="mt-3 text-xs font-mono text-primary">{{ error() }}</p>
          </div>
        </ng-container>
      </section>
    </div>
  `,
})
export class AdminJobsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  protected jobs = signal<AdminJobSummary[]>([]);
  protected loading = signal(false);
  protected selected = signal<AdminJobSummary | null>(null);

  protected bundle = signal<RecruiterBundle | null>(null);
  protected bundleLoading = signal(false);

  protected composing = signal(false);
  protected sending = signal(false);
  protected result = signal<EmailResult | null>(null);
  protected error = signal<string | null>(null);

  protected form = { subject: '', body: '' };

  ngOnInit(): void { this.loadJobs(); }

  private loadJobs(): void {
    this.loading.set(true);
    this.http.get<{ content: AdminJobSummary[] }>(
      `${environment.apiUrl}/admin/jobs?size=100`
    ).subscribe({
      next: r => { this.jobs.set(r.content ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('Could not load jobs.'); },
    });
  }

  selectJob(j: AdminJobSummary): void {
    this.selected.set(j);
    this.composing.set(false);
    this.result.set(null);
    this.error.set(null);
    this.bundle.set(null);
    this.bundleLoading.set(true);
    this.http.get<RecruiterBundle>(
      `${environment.apiUrl}/admin/jobs/${j.id}/applications`
    ).subscribe({
      next: b => { this.bundle.set(b); this.bundleLoading.set(false); },
      error: () => { this.bundleLoading.set(false); this.toast.error('Could not load applications.'); },
    });
  }

  openComposer(): void {
    const b = this.bundle();
    if (!b) return;
    const greeting = b.recruiterFirstName?.trim() || 'there';
    this.form.subject = `Applications for "${b.jobTitle}" — ${b.applications.length} candidates`;
    this.form.body =
      `Hi ${greeting}, here is the consolidated list of candidates who applied to your ` +
      `job offer "${b.jobTitle}". You'll find each candidate's CV attached, plus a summary spreadsheet.`;
    this.result.set(null);
    this.error.set(null);
    this.composing.set(true);
  }

  send(): void {
    const b = this.bundle();
    if (!b) return;
    this.sending.set(true);
    this.error.set(null);
    this.result.set(null);
    this.http.post<EmailResult>(
      `${environment.apiUrl}/admin/jobs/${b.jobId}/email-applications`,
      { subject: this.form.subject, body: this.form.body }
    ).subscribe({
      next: r => {
        this.sending.set(false);
        this.result.set(r);
        this.toast.success(`Sent to ${r.recruiterEmail} with ${r.attachmentCount} attachment(s).`);
      },
      error: err => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? 'Send failed.');
      },
    });
  }

  cvCount(b: RecruiterBundle): number {
    return b.applications.filter(a => !!a.cvUrl).length;
  }

  csvName(b: RecruiterBundle): string {
    const slug = (b.jobTitle || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `applications-${slug}-${d}.csv`;
  }
}
