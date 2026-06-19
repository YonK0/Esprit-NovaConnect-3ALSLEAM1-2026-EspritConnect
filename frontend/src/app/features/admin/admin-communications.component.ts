import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from '../../core/services/token-storage.service';
import { ToastService } from '../../shared/toast.service';

/** Mailing lists exposed in the dropdown — must match
 *  {@code AdminMailService.VALID_LISTS} on the backend. */
const MAILING_LISTS = [
  { code: 'ALL',       label: 'All active users' },
  { code: 'STUDENT',   label: 'Students' },
  { code: 'ALUMNI',    label: 'Alumni' },
  { code: 'MENTOR',    label: 'Mentors' },
  { code: 'RECRUITER', label: 'Recruiters' },
  { code: 'ADMIN',     label: 'Admins' },
] as const;

interface BulkMailResponse {
  list: string;
  recipientCount: number;
  ok: boolean;
}

/**
 * Admin Communications page: download the users CSV and compose a bulk
 * email to a built-in mailing list. Both are simple panels — no
 * pagination, no rich-text editor — to keep the surface small and let
 * the operator finish in one click.
 *
 * The CSV download uses fetch() rather than HttpClient because we need
 * to read the {@code Authorization: Bearer} header in alongside a
 * binary response and trigger a browser save. Doing it via a manual
 * anchor with a presigned URL would require a separate backend route.
 */
@Component({
  selector: 'ec-admin-communications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · COMMUNICATIONS</p>
    <h1 class="font-display text-3xl font-bold mb-6">Communications</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- ─────────── Export panel ─────────── -->
      <section class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
        <p class="text-xs font-mono text-ink-300 mb-1">EXPORT</p>
        <h2 class="font-display text-lg font-bold mb-4">Download all users</h2>
        <p class="text-sm text-ink-300 mb-4">
          Full list of non-deleted users as a UTF-8 CSV file. Columns:
          id, email, role, status, name, country, promotion year, created
          and last-login timestamps.
        </p>
        <button (click)="exportCsv()"
                [disabled]="exporting()"
                class="px-4 py-2 rounded bg-primary text-white font-semibold
                       hover:bg-primary-dark disabled:opacity-50 text-sm">
          {{ exporting() ? 'Preparing…' : '⬇ Download CSV' }}
        </button>
        <p *ngIf="exportError()" class="text-primary text-xs mt-3 font-mono">
          {{ exportError() }}
        </p>
      </section>

      <!-- ─────────── Compose panel ─────────── -->
      <section class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
        <p class="text-xs font-mono text-ink-300 mb-1">SEND EMAIL</p>
        <h2 class="font-display text-lg font-bold mb-4">Compose a broadcast</h2>

        <form (ngSubmit)="send()" #f="ngForm">
          <label class="block text-xs font-mono text-ink-300 mb-1">Mailing list</label>
          <select [(ngModel)]="form.list" name="list"
                  class="w-full bg-ink-900 border border-primary/30 rounded
                         px-3 py-2 text-sm font-mono mb-4">
            <option *ngFor="let l of lists" [value]="l.code">{{ l.label }}</option>
          </select>

          <label class="block text-xs font-mono text-ink-300 mb-1">Subject</label>
          <input [(ngModel)]="form.subject" name="subject" required
                 class="w-full bg-ink-900 border border-primary/30 rounded
                        px-3 py-2 text-sm mb-4"
                 placeholder="e.g. Career fair on Friday — RSVP by Wed">

          <label class="block text-xs font-mono text-ink-300 mb-1">
            Body
            <span class="text-ink-300/60 normal-case font-sans">
              (HTML allowed; plain text also fine)
            </span>
          </label>
          <textarea [(ngModel)]="form.bodyHtml" name="bodyHtml" required rows="8"
                    class="w-full bg-ink-900 border border-primary/30 rounded
                           px-3 py-2 text-sm mb-4 font-mono"
                    placeholder="Hi everyone, …"></textarea>

          <div class="flex items-center justify-between">
            <p class="text-xs text-ink-300 font-mono">
              Recipients are in BCC — they won't see each other's addresses.
            </p>
            <button type="submit"
                    [disabled]="sending() || !f.valid"
                    class="px-4 py-2 rounded bg-primary text-white font-semibold
                           hover:bg-primary-dark disabled:opacity-50 text-sm">
              {{ sending() ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </form>

        <p *ngIf="lastResult() as r"
           class="mt-4 text-xs font-mono text-green-400">
          ✓ Sent to {{ r.recipientCount }} recipient(s) in list {{ r.list }}.
        </p>
        <p *ngIf="sendError()" class="text-primary text-xs mt-3 font-mono">
          {{ sendError() }}
        </p>
      </section>
    </div>
  `,
})
export class AdminCommunicationsComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private tokens = inject(TokenStorageService);

  protected readonly lists = MAILING_LISTS;

  protected exporting = signal(false);
  protected exportError = signal<string | null>(null);

  protected sending = signal(false);
  protected sendError = signal<string | null>(null);
  protected lastResult = signal<BulkMailResponse | null>(null);

  protected form = { list: 'ALL', subject: '', bodyHtml: '' };

  /**
   * Streams the CSV via fetch() so we can attach the JWT header. The
   * response is materialized as a Blob and saved to disk via a hidden
   * <a download> click — no third-party file-saver dep needed.
   */
  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const res = await fetch(`${environment.apiUrl}/admin/users/export.csv`, {
        headers: {
          Authorization: `Bearer ${this.tokens.getAccess() ?? ''}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `espritconnect-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.success('CSV downloaded');
    } catch (err: any) {
      this.exportError.set(err?.message ?? 'Export failed');
    } finally {
      this.exporting.set(false);
    }
  }

  send(): void {
    this.sending.set(true);
    this.sendError.set(null);
    this.lastResult.set(null);
    this.http.post<BulkMailResponse>(
      `${environment.apiUrl}/admin/mail/bulk`,
      this.form,
    ).subscribe({
      next: r => {
        this.sending.set(false);
        this.lastResult.set(r);
        this.toast.success(`Sent to ${r.recipientCount} recipient(s)`);
        // Clear the subject/body so a follow-up send is intentional, not
        // an accidental double-click on the same content.
        this.form.subject = '';
        this.form.bodyHtml = '';
      },
      error: err => {
        this.sending.set(false);
        this.sendError.set(err?.error?.message ?? err?.message ?? 'Send failed');
      },
    });
  }
}
