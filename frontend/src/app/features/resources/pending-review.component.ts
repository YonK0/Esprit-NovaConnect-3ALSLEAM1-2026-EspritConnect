import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ResourcesService, PendingItem } from './resources.service';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'ec-resource-pending-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <a routerLink="/resources" class="text-sm text-primary hover:underline">← Back to Resources</a>

    <div class="card mt-3 mb-6">
      <p class="text-xs font-mono text-primary mb-1">▸ ADMIN · RESOURCES</p>
      <h1 class="font-display text-2xl font-bold">Pending Review</h1>
      <p class="text-ink-600 text-sm">Uploads from students awaiting approval before they go public.</p>
    </div>

    <div *ngIf="loading()" class="space-y-2">
      <div *ngFor="let _ of [1,2,3]" class="h-16 rounded-lg bg-ink-100 animate-pulse"></div>
    </div>

    <div *ngIf="!loading() && items().length === 0" class="card text-center text-ink-500 py-12">
      <p class="text-3xl mb-2">✅</p>
      <p>Nothing to review — the queue is clear.</p>
    </div>

    <div *ngIf="!loading() && items().length" class="space-y-2">
      <div *ngFor="let it of items()" class="card !py-3">
        <div class="flex items-center gap-4">
          <span class="text-2xl shrink-0">{{ it.type === 'file' ? '📄' : '🔗' }}</span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold truncate">{{ it.title }}</p>
            <p class="text-xs text-ink-500">
              {{ it.type | uppercase }} · in
              <a [routerLink]="['/resources', it.folderId]" class="text-primary hover:underline">{{ it.folderTitle }}</a>
              · by {{ it.submitterName }} · {{ it.createdAt | date:'medium' }}
            </p>
          </div>
          <a *ngIf="it.url" [href]="it.url" target="_blank" rel="noopener"
             class="btn-secondary text-xs py-1.5 px-3 shrink-0">Preview ↗</a>
          <button class="btn-primary text-xs py-1.5 px-3 shrink-0"
                  [disabled]="busy()[it.id]" (click)="approve(it)">✓ Approve</button>
          <button class="btn-secondary text-xs py-1.5 px-3 shrink-0"
                  [disabled]="busy()[it.id]" (click)="startReject(it.id)">× Reject</button>
        </div>

        <!-- Inline reject reason -->
        <div *ngIf="rejectingId() === it.id" class="flex items-center gap-2 mt-3 pl-12">
          <input class="field !py-1.5 text-sm flex-1" [(ngModel)]="reason"
                 placeholder="Optional rejection reason (shown to the submitter)" />
          <button class="btn-primary text-xs py-1.5 px-3" [disabled]="busy()[it.id]"
                  (click)="confirmReject(it)">Confirm reject</button>
          <button class="btn-secondary text-xs py-1.5 px-3" (click)="rejectingId.set(null)">Cancel</button>
        </div>
      </div>
    </div>
  `
})
export class PendingReviewComponent implements OnInit {
  private api = inject(ResourcesService);
  private toast = inject(ToastService);

  protected items = signal<PendingItem[]>([]);
  protected loading = signal(true);
  protected busy = signal<Record<string, boolean>>({});
  protected rejectingId = signal<string | null>(null);
  protected reason = '';

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.api.pending().subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private setBusy(id: string, v: boolean): void {
    this.busy.set({ ...this.busy(), [id]: v });
  }

  approve(it: PendingItem): void {
    this.setBusy(it.id, true);
    this.api.approve(it.id).subscribe({
      next: () => { this.toast.success('Approved — now visible.'); this.remove(it.id); },
      error: err => { this.setBusy(it.id, false); this.toast.error(err?.error?.message ?? 'Approve failed.'); }
    });
  }

  startReject(id: string): void {
    this.reason = '';
    this.rejectingId.set(id);
  }

  confirmReject(it: PendingItem): void {
    this.setBusy(it.id, true);
    this.api.reject(it.id, this.reason.trim()).subscribe({
      next: () => { this.toast.success('Rejected.'); this.rejectingId.set(null); this.remove(it.id); },
      error: err => { this.setBusy(it.id, false); this.toast.error(err?.error?.message ?? 'Reject failed.'); }
    });
  }

  private remove(id: string): void {
    this.items.set(this.items().filter(i => i.id !== id));
  }
}
