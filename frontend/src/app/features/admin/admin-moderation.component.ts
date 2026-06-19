import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';
import { ResourcesService, ResourceFolder, PendingItem } from '../resources/resources.service';

type ContentType = 'JOB' | 'EVENT' | 'GROUP' | 'MENTOR_PROFILE' | 'RESOURCE';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ModerationItem {
  id: string;
  type: ContentType;
  title: string;
  summary: string;
  ownerId: string;
  ownerEmail: string;
  status: Status;
  createdAt: string;
}

interface Page<T> { content: T[]; totalElements: number; }

@Component({
  selector: 'ec-admin-moderation',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · MODERATION</p>
    <h1 class="font-display text-3xl font-bold mb-6">Pending content review</h1>

    <div class="flex flex-wrap gap-2 mb-4">
      <button *ngFor="let t of types" (click)="setType(t.value)"
              class="px-4 py-2 rounded-lg border text-sm font-mono"
              [class.bg-primary]="activeType() === t.value"
              [class.text-white]="activeType() === t.value"
              [class.border-primary]="activeType() === t.value"
              [class.border-ink-300]="activeType() !== t.value"
              [class.bg-ink-900]="activeType() !== t.value"
              [class.text-ink-100]="activeType() !== t.value">
        {{ t.label }} <span *ngIf="counts()[t.value] != null"
                            class="ml-2 text-xs"
                            [class.text-white]="activeType() === t.value">
          {{ counts()[t.value] }}
        </span>
      </button>
    </div>

    <!-- ───────── Generic moderation (jobs / events / groups / mentors) ───────── -->
    <ng-container *ngIf="activeType() !== 'RESOURCE'">
      <div class="flex gap-2 mb-6 text-xs font-mono">
        <button *ngFor="let s of statuses" (click)="setStatus(s)"
                class="px-3 py-1 rounded border"
                [class.bg-primary]="activeStatus() === s"
                [class.text-white]="activeStatus() === s"
                [class.border-primary]="activeStatus() === s"
                [class.border-ink-300]="activeStatus() !== s"
                [class.bg-ink-900]="activeStatus() !== s"
                [class.text-ink-100]="activeStatus() !== s">
          {{ s }}
        </button>
      </div>

      <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-4">
        <p class="text-sm text-primary">{{ error() }}</p>
      </div>

      <div *ngIf="loading()" class="text-ink-300 text-sm">Loading...</div>

      <div *ngIf="!loading() && items().length === 0"
           class="bg-ink-900/40 border border-primary/20 rounded-xl p-8 text-center text-ink-300">
        Nothing to review here right now. ✨
      </div>

      <div class="space-y-3">
        <article *ngFor="let it of items()"
                 class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <div class="flex justify-between items-start gap-4">
            <div class="flex-1">
              <p class="text-xs font-mono text-primary">▸ {{ it.type }}</p>
              <h3 class="font-display text-lg font-bold mt-1">{{ it.title }}</h3>
              <p class="text-sm text-ink-300 mt-2">{{ it.summary }}</p>
              <p class="text-xs text-ink-500 mt-3 font-mono">
                by {{ it.ownerEmail }} · {{ it.createdAt | date:'short' }}
              </p>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button *ngIf="it.status !== 'APPROVED'"
                      (click)="approve(it)"
                      class="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold
                             hover:bg-primary-dark disabled:opacity-50"
                      [disabled]="busy()[it.id]">
                {{ busy()[it.id] ? '…' : 'Approve' }}
              </button>
              <button *ngIf="it.status !== 'REJECTED'"
                      (click)="reject(it)"
                      class="px-3 py-1.5 rounded border border-primary/50 text-primary text-xs
                             hover:bg-primary/10 disabled:opacity-50"
                      [disabled]="busy()[it.id]">
                Reject
              </button>
            </div>
          </div>
        </article>
      </div>
    </ng-container>

    <!-- ───────── Resources: category management + upload review ───────── -->
    <ng-container *ngIf="activeType() === 'RESOURCE'">
      <!-- New category -->
      <div class="bg-ink-900/60 border border-primary/20 rounded-xl p-5 mb-6">
        <p class="text-xs font-mono text-primary mb-3">▸ NEW CATEGORY</p>
        <div class="grid md:grid-cols-2 gap-3">
          <input [(ngModel)]="newCatTitle"
                 class="bg-ink-900 border border-ink-700 rounded px-3 py-2 text-sm"
                 placeholder="Category title (e.g. PFE BOOK 24-25)" />
          <input [(ngModel)]="newCatDesc"
                 class="bg-ink-900 border border-ink-700 rounded px-3 py-2 text-sm"
                 placeholder="Short description (optional)" />
        </div>
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <label class="text-sm text-ink-300 cursor-pointer hover:text-primary inline-flex items-center gap-2">
            📷 {{ newCatFileName() || 'Choose cover image' }}
            <input type="file" accept="image/*" hidden (change)="onNewCatFile($event)" />
          </label>
          <button class="ml-auto px-4 py-2 rounded bg-primary text-white text-sm font-semibold disabled:opacity-50"
                  [disabled]="creatingCat()" (click)="createCategory()">
            {{ creatingCat() ? '…' : 'Create category' }}
          </button>
        </div>
      </div>

      <!-- Pending uploads -->
      <h3 class="font-display text-lg font-bold mb-3">Pending uploads</h3>
      <div *ngIf="resLoading()" class="text-ink-300 text-sm">Loading...</div>
      <div *ngIf="!resLoading() && resPending().length === 0"
           class="bg-ink-900/40 border border-primary/20 rounded-xl p-8 text-center text-ink-300">
        No resource uploads waiting for review. ✨
      </div>
      <div class="space-y-3">
        <article *ngFor="let it of resPending()"
                 class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
          <div class="flex justify-between items-start gap-4">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-mono text-primary">▸ {{ it.type | uppercase }} · {{ it.folderTitle }}</p>
              <h3 class="font-display text-lg font-bold mt-1 truncate">{{ it.title }}</h3>
              <p class="text-xs text-ink-500 mt-2 font-mono">
                by {{ it.submitterName }} · {{ it.createdAt | date:'short' }}
              </p>
              <a *ngIf="it.url" [href]="it.url" target="_blank" rel="noopener"
                 class="text-xs text-primary hover:underline">Preview ↗</a>
            </div>
            <div class="flex flex-col gap-2 shrink-0">
              <button (click)="approveRes(it)" [disabled]="busy()[it.id]"
                      class="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold
                             hover:bg-primary-dark disabled:opacity-50">
                {{ busy()[it.id] ? '…' : 'Approve' }}
              </button>
              <button (click)="rejectRes(it)" [disabled]="busy()[it.id]"
                      class="px-3 py-1.5 rounded border border-primary/50 text-primary text-xs
                             hover:bg-primary/10 disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        </article>
      </div>

      <!-- Categories (replace cover image) -->
      <h3 class="font-display text-lg font-bold mt-8 mb-3">Categories</h3>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div *ngFor="let f of resFolders()"
             class="bg-ink-900/60 border border-primary/20 rounded-xl overflow-hidden">
          <div class="h-24 bg-ink-800 relative">
            <img *ngIf="f.coverImageUrl" [src]="f.coverImageUrl" alt="" (error)="f.coverImageUrl = ''"
                 class="w-full h-full object-cover" />
          </div>
          <div class="p-3">
            <p class="font-semibold text-sm truncate">{{ f.title }}</p>
            <p class="text-xs text-ink-500 mb-1">{{ f.itemCount }} items</p>
            <label class="text-xs text-primary cursor-pointer hover:underline inline-flex items-center gap-1">
              {{ coverBusy()[f.id] ? 'Uploading…' : '📷 Change image' }}
              <input type="file" accept="image/*" hidden (change)="onChangeCover(f, $event)" />
            </label>
          </div>
        </div>
      </div>
    </ng-container>
  `
})
export class AdminModerationComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private resApi = inject(ResourcesService);
  private route = inject(ActivatedRoute);

  protected types: { value: ContentType; label: string }[] = [
    { value: 'JOB',            label: 'Jobs' },
    { value: 'EVENT',          label: 'Events' },
    { value: 'GROUP',          label: 'Groups' },
    { value: 'MENTOR_PROFILE', label: 'Mentor profiles' },
    { value: 'RESOURCE',       label: 'Resources' }
  ];
  protected statuses: Status[] = ['PENDING', 'APPROVED', 'REJECTED'];

  protected activeType = signal<ContentType>('JOB');
  protected activeStatus = signal<Status>('PENDING');

  protected items = signal<ModerationItem[]>([]);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected busy = signal<Record<string, boolean>>({});
  protected counts = signal<Record<string, number>>({});

  // ── Resources tab state ──
  protected resPending = signal<PendingItem[]>([]);
  protected resFolders = signal<ResourceFolder[]>([]);
  protected resLoading = signal(false);
  protected coverBusy = signal<Record<string, boolean>>({});
  protected creatingCat = signal(false);
  protected newCatTitle = '';
  protected newCatDesc = '';
  protected newCatFileName = signal<string | null>(null);
  private newCatFile: File | null = null;

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && this.types.some(t => t.value === tab)) {
      this.activeType.set(tab as ContentType);
    }
    this.refresh();
    this.refreshCounts();
  }

  setType(t: ContentType): void { this.activeType.set(t); this.refresh(); }
  setStatus(s: Status): void { this.activeStatus.set(s); this.refresh(); }

  refresh(): void {
    if (this.activeType() === 'RESOURCE') { this.loadResources(); return; }
    this.loading.set(true);
    this.error.set(null);
    const url = `${environment.apiUrl}/admin/moderation/${this.activeType()}` +
                `?status=${this.activeStatus()}&size=50`;
    this.http.get<Page<ModerationItem>>(url).subscribe({
      next: (page) => {
        this.items.set(page.content ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to load moderation queue.');
      }
    });
  }

  /** Pre-fetch pending counts so the tab badges show how many items wait. */
  refreshCounts(): void {
    this.types.forEach(t => {
      if (t.value === 'RESOURCE') return;
      this.http.get<Page<ModerationItem>>(
        `${environment.apiUrl}/admin/moderation/${t.value}?status=PENDING&size=1`
      ).subscribe({
        next: (page) => {
          this.counts.update(c => ({ ...c, [t.value]: page.totalElements ?? 0 }));
        }
      });
    });
    this.resApi.pendingCount().subscribe({
      next: r => this.counts.update(c => ({ ...c, RESOURCE: r.count }))
    });
  }

  approve(it: ModerationItem): void {
    this.setBusy(it.id, true);
    this.http.post(
      `${environment.apiUrl}/admin/moderation/${it.type}/${it.id}/approve`, {}
    ).subscribe({
      next: () => {
        this.setBusy(it.id, false); this.refresh(); this.refreshCounts();
        this.toast.success(`Approved: ${it.title}`);
      },
      error: (err) => {
        this.setBusy(it.id, false);
        this.toast.error(err?.error?.message ?? 'Approve failed.');
      }
    });
  }

  reject(it: ModerationItem): void {
    const reason = prompt('Reason for rejection (optional):') ?? '';
    this.setBusy(it.id, true);
    const params = reason.trim() ? `?reason=${encodeURIComponent(reason)}` : '';
    this.http.post(
      `${environment.apiUrl}/admin/moderation/${it.type}/${it.id}/reject${params}`, {}
    ).subscribe({
      next: () => {
        this.setBusy(it.id, false); this.refresh(); this.refreshCounts();
        this.toast.info(`Rejected: ${it.title}`);
      },
      error: (err) => {
        this.setBusy(it.id, false);
        this.toast.error(err?.error?.message ?? 'Reject failed.');
      }
    });
  }

  // ── Resources actions ──
  private loadResources(): void {
    this.resLoading.set(true);
    this.resApi.pending().subscribe({
      next: p => { this.resPending.set(p); this.resLoading.set(false); },
      error: () => this.resLoading.set(false)
    });
    this.resApi.listFolders().subscribe({ next: f => this.resFolders.set(f) });
  }

  approveRes(it: PendingItem): void {
    this.setBusy(it.id, true);
    this.resApi.approve(it.id).subscribe({
      next: () => {
        this.setBusy(it.id, false);
        this.resPending.set(this.resPending().filter(p => p.id !== it.id));
        this.refreshCounts();
        this.toast.success(`Approved: ${it.title}`);
      },
      error: (err) => { this.setBusy(it.id, false); this.toast.error(err?.error?.message ?? 'Approve failed.'); }
    });
  }

  rejectRes(it: PendingItem): void {
    const reason = prompt('Reason for rejection (optional):') ?? '';
    this.setBusy(it.id, true);
    this.resApi.reject(it.id, reason.trim()).subscribe({
      next: () => {
        this.setBusy(it.id, false);
        this.resPending.set(this.resPending().filter(p => p.id !== it.id));
        this.refreshCounts();
        this.toast.info(`Rejected: ${it.title}`);
      },
      error: (err) => { this.setBusy(it.id, false); this.toast.error(err?.error?.message ?? 'Reject failed.'); }
    });
  }

  onNewCatFile(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.newCatFile = f;
    this.newCatFileName.set(f?.name ?? null);
  }

  createCategory(): void {
    if (!this.newCatTitle.trim()) { this.toast.error('A category title is required.'); return; }
    this.creatingCat.set(true);
    this.resApi.createFolder({ title: this.newCatTitle.trim(), description: this.newCatDesc.trim() })
      .subscribe({
        next: folder => {
          const done = () => {
            this.creatingCat.set(false);
            this.newCatTitle = ''; this.newCatDesc = '';
            this.newCatFile = null; this.newCatFileName.set(null);
            this.loadResources();
            this.toast.success('Category created.');
          };
          if (this.newCatFile) {
            this.resApi.uploadFolderCover(folder.id, this.newCatFile).subscribe({
              next: done,
              error: () => { done(); this.toast.error('Category created, but the cover image failed to upload.'); }
            });
          } else { done(); }
        },
        error: (err) => { this.creatingCat.set(false); this.toast.error(err?.error?.message ?? 'Could not create category.'); }
      });
  }

  onChangeCover(folder: ResourceFolder, ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    this.coverBusy.update(b => ({ ...b, [folder.id]: true }));
    this.resApi.uploadFolderCover(folder.id, file).subscribe({
      next: updated => {
        this.coverBusy.update(b => ({ ...b, [folder.id]: false }));
        this.resFolders.set(this.resFolders().map(f => f.id === folder.id ? updated : f));
        this.toast.success('Cover image updated.');
      },
      error: (err) => {
        this.coverBusy.update(b => ({ ...b, [folder.id]: false }));
        this.toast.error(err?.error?.message ?? 'Image upload failed.');
      }
    });
  }

  private setBusy(id: string, value: boolean): void {
    this.busy.update(b => ({ ...b, [id]: value }));
  }
}
