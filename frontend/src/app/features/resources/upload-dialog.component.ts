import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourcesService, ResourceItem } from './resources.service';

/**
 * Modal to submit a new resource (file or link) to a folder. The backend sets
 * the moderation status from the caller's role; this dialog just reports back
 * the created item so the parent can show the right confirmation.
 */
@Component({
  selector: 'ec-resource-upload-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
         (click)="close.emit()">
      <div class="card w-full max-w-lg !p-6" (click)="$event.stopPropagation()">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-display text-xl font-bold">Add a resource</h3>
          <button class="text-ink-500 hover:text-ink-800 text-xl leading-none"
                  (click)="close.emit()">×</button>
        </div>

        <!-- file / link toggle -->
        <div class="inline-flex rounded-lg border border-ink-300 p-1 mb-4">
          <button class="px-4 py-1.5 rounded text-sm font-mono"
                  [class.bg-ink-100]="type() === 'file'" (click)="type.set('file')">📎 File</button>
          <button class="px-4 py-1.5 rounded text-sm font-mono"
                  [class.bg-ink-100]="type() === 'link'" (click)="type.set('link')">🔗 Link</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="label">Title</label>
            <input class="field" [(ngModel)]="title" placeholder="e.g. Internship report 2024" />
          </div>

          <div *ngIf="type() === 'link'">
            <label class="label">URL</label>
            <input class="field" [(ngModel)]="url" placeholder="https://…" />
          </div>

          <div *ngIf="type() === 'file'">
            <label class="label">File</label>
            <input type="file" (change)="onFile($event)"
                   class="block w-full text-sm text-ink-600
                          file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0
                          file:bg-ink-100 file:text-ink-800 file:cursor-pointer" />
            <p class="text-xs text-ink-500 mt-1">Max 25 MB.</p>
          </div>

          <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
            <p class="text-sm text-primary">{{ error() }}</p>
          </div>
        </div>

        <div class="flex gap-3 pt-5">
          <button class="btn-secondary flex-1" (click)="close.emit()">Cancel</button>
          <button class="btn-primary flex-1" [disabled]="saving()" (click)="submit()">
            {{ saving() ? '…' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class UploadDialogComponent {
  private api = inject(ResourcesService);

  @Input({ required: true }) folderId!: string;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<ResourceItem>();

  protected type = signal<'file' | 'link'>('file');
  protected title = '';
  protected url = '';
  protected saving = signal(false);
  protected error = signal<string | null>(null);
  private file: File | null = null;

  onFile(ev: Event): void {
    this.file = (ev.target as HTMLInputElement).files?.[0] ?? null;
  }

  submit(): void {
    this.error.set(null);
    if (!this.title.trim()) { this.error.set('A title is required.'); return; }
    const fd = new FormData();
    fd.append('type', this.type());
    fd.append('title', this.title.trim());
    if (this.type() === 'link') {
      if (!this.url.trim()) { this.error.set('A URL is required.'); return; }
      fd.append('url', this.url.trim());
    } else {
      if (!this.file) { this.error.set('Choose a file to upload.'); return; }
      if (this.file.size > 25 * 1024 * 1024) { this.error.set('File must not exceed 25 MB.'); return; }
      fd.append('file', this.file);
    }
    this.saving.set(true);
    this.api.createItem(this.folderId, fd).subscribe({
      next: item => { this.saving.set(false); this.created.emit(item); },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Upload failed. Try again.');
      }
    });
  }
}
