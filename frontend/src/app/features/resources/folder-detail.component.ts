import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ResourcesService, ResourceFolder, ResourceItem } from './resources.service';
import { UploadDialogComponent } from './upload-dialog.component';
import { ToastService } from '../../shared/toast.service';

@Component({
  selector: 'ec-folder-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, UploadDialogComponent],
  template: `
    <a routerLink="/resources" class="text-sm text-primary hover:underline">← Back to Resources</a>

    <!-- Folder header -->
    <div *ngIf="folder() as f" class="card !p-0 overflow-hidden mt-3 mb-6">
      <div class="h-40 relative">
        <img *ngIf="f.coverImageUrl" [src]="f.coverImageUrl" alt="" (error)="f.coverImageUrl = ''"
             class="absolute inset-0 w-full h-full object-cover" />
        <div *ngIf="!f.coverImageUrl"
             class="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-glow"></div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div class="absolute bottom-3 left-5 right-5">
          <h1 class="font-display text-2xl font-bold text-white">{{ f.title }}</h1>
          <p *ngIf="f.description" class="text-white/85 text-sm truncate">{{ f.description }}</p>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between mb-4">
      <h2 class="font-display text-lg font-bold">
        Items <span class="text-ink-500 font-mono text-sm">({{ approvedCount() }})</span>
      </h2>
      <button class="btn-primary text-sm py-2 px-4" (click)="showUpload.set(true)">+ Add resource</button>
    </div>

    <!-- Loading -->
    <div *ngIf="loading()" class="space-y-2">
      <div *ngFor="let _ of [1,2,3]" class="h-14 rounded-lg bg-ink-100 animate-pulse"></div>
    </div>

    <!-- Empty -->
    <div *ngIf="!loading() && items().length === 0"
         class="card text-center text-ink-500 py-12">
      <p class="text-3xl mb-2">🗂️</p>
      <p>No items yet — be the first to add one.</p>
    </div>

    <!-- Items -->
    <div *ngIf="!loading() && items().length" class="space-y-2">
      <div *ngFor="let it of items()"
           class="card flex items-center gap-4 !py-3"
           [class.opacity-70]="it.ownPending">
        <span class="text-2xl shrink-0">{{ it.type === 'file' ? '📄' : '🔗' }}</span>
        <div class="min-w-0 flex-1">
          <p class="font-semibold truncate">
            {{ it.title }}
            <span *ngIf="it.ownPending"
                  class="ml-2 align-middle chip-yellow text-[10px]">Pending review</span>
          </p>
          <p class="text-xs text-ink-500">
            {{ it.type | uppercase }}
            <span *ngIf="it.size"> · {{ humanSize(it.size) }}</span>
            · by {{ it.submittedByName }} · {{ it.createdAt | date:'mediumDate' }}
          </p>
        </div>
        <a *ngIf="it.url" [href]="it.url" target="_blank" rel="noopener"
           class="btn-secondary text-xs py-1.5 px-3 shrink-0">Open ↗</a>
      </div>
    </div>

    <!-- Upload dialog -->
    <ec-resource-upload-dialog *ngIf="showUpload()"
        [folderId]="folderId"
        (close)="showUpload.set(false)"
        (created)="onCreated($event)"></ec-resource-upload-dialog>
  `
})
export class FolderDetailComponent implements OnInit {
  private api = inject(ResourcesService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  protected folder = signal<ResourceFolder | null>(null);
  protected items = signal<ResourceItem[]>([]);
  protected loading = signal(true);
  protected showUpload = signal(false);

  protected folderId = '';

  ngOnInit(): void {
    this.folderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.getFolder(this.folderId).subscribe({ next: f => this.folder.set(f) });
    this.loadItems();
  }

  approvedCount(): number {
    return this.items().filter(i => !i.ownPending).length;
  }

  private loadItems(): void {
    this.loading.set(true);
    this.api.listItems(this.folderId).subscribe({
      next: items => { this.items.set(items); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  onCreated(item: ResourceItem): void {
    this.showUpload.set(false);
    if (item.status === 'PENDING') {
      this.toast.success('Submitted — pending admin review.');
    } else {
      this.toast.success('Added.');
    }
    this.loadItems();
  }

  humanSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
}
