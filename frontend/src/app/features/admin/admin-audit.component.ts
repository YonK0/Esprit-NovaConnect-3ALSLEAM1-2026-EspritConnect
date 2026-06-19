import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, JsonPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Page<T> { content: T[]; totalElements: number; }

@Component({
  selector: 'ec-admin-audit',
  standalone: true,
  imports: [CommonModule, DatePipe, JsonPipe],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · AUDIT LOG</p>
    <h1 class="font-display text-3xl font-bold mb-6">Audit log</h1>

    <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-4">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <div class="bg-ink-900/60 border border-primary/20 rounded-xl">
      <ul class="divide-y divide-primary/10">
        <li *ngIf="loading()" class="px-4 py-6 text-center text-ink-300">Loading...</li>
        <li *ngIf="!loading() && entries().length === 0"
            class="px-4 py-6 text-center text-ink-300">No audit entries yet.</li>
        <li *ngFor="let e of entries()" class="px-4 py-3 grid grid-cols-[1fr_auto] gap-4">
          <div>
            <p class="font-mono text-sm text-primary">{{ e.action }}</p>
            <p class="text-xs text-ink-300 mt-1">
              user: <span class="font-mono">{{ e.userId ?? 'system' }}</span>
            </p>
            <pre class="text-xs text-ink-300 mt-1 whitespace-pre-wrap">{{ e.metadata | json }}</pre>
          </div>
          <p class="text-xs text-ink-300 font-mono">{{ e.createdAt | date:'short' }}</p>
        </li>
      </ul>
    </div>
  `
})
export class AdminAuditComponent implements OnInit {
  private http = inject(HttpClient);

  protected entries = signal<AuditEntry[]>([]);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.http.get<Page<AuditEntry>>(`${environment.apiUrl}/admin/audit-logs?size=100`)
      .subscribe({
        next: (page) => { this.entries.set(page.content ?? []); this.loading.set(false); },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to load audit log.');
        }
      });
  }
}
