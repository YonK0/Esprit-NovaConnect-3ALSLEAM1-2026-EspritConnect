import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface Group {
  id: string; name: string; type: string; description?: string;
  isPrivate: boolean; memberCount: number; ownerId: string;
  isMember: boolean; isOwner?: boolean; hasPendingRequest?: boolean;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  coverUrl?: string;
}

type Filter = 'all' | 'PROMO' | 'SPECIALTY' | 'REGION' | 'INTEREST' | 'WOMEN' | 'FOUNDERS' | 'MENTORSHIP';

@Component({
  selector: 'ec-groups',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="flex justify-between items-end gap-4 mb-6">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ COMMUNITIES</p>
        <h1 class="font-display text-3xl font-bold">Groups &amp; private communities.</h1>
      </div>
      <a routerLink="/groups/new" class="btn-primary">+ New group</a>
    </div>

    <!-- Search -->
    <div class="card flex items-center gap-2 !py-2.5 !px-4 mb-4">
      <span class="text-ink-500">🔍</span>
      <input class="flex-1 bg-transparent outline-none text-sm" type="text"
             [(ngModel)]="query" (ngModelChange)="search()"
             placeholder="Search groups by name or description…" />
      <span class="text-xs font-mono text-ink-500 shrink-0">
        {{ filteredGroups().length }} result(s)
      </span>
    </div>

    <!-- Filter chips -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button *ngFor="let f of filters"
              (click)="activeFilter.set(f.id)"
              class="px-4 py-1.5 rounded-full text-sm font-mono border transition"
              [class.bg-ink-900]="activeFilter() === f.id"
              [class.text-white]="activeFilter() === f.id"
              [class.border-ink-900]="activeFilter() === f.id"
              [class.bg-white]="activeFilter() !== f.id"
              [class.border-ink-300]="activeFilter() !== f.id">
        {{ f.label }}
      </button>
    </div>

    <div class="grid md:grid-cols-3 gap-4 items-stretch">
      <article *ngFor="let g of filteredGroups(); let i = index"
               class="rounded-xl overflow-hidden bg-white shadow-sm border border-ink-300/40
                      flex flex-col h-full">
        <!-- Gradient header -->
        <a [routerLink]="['/groups', g.id]"
           class="block h-32 p-4 text-white relative overflow-hidden hover:opacity-95 transition"
           [ngClass]="gradientFor(i)">
          <img *ngIf="g.coverUrl" [src]="g.coverUrl" alt="" (error)="g.coverUrl = ''"
               class="absolute inset-0 w-full h-full object-cover" />
          <span *ngIf="g.coverUrl" class="absolute inset-0 bg-black/30"></span>
          <span class="absolute top-3 right-3 chip !bg-white/15 !text-white">
            {{ typeLabel(g.type) }}
          </span>
          <span *ngIf="g.moderationStatus === 'PENDING'"
                class="absolute bottom-3 right-3 chip-yellow">PENDING</span>
          <span *ngIf="g.moderationStatus === 'REJECTED'"
                class="absolute bottom-3 right-3 chip-red">REJECTED</span>
          <span *ngIf="g.moderationStatus === 'APPROVED' && isActive(g)"
                class="absolute bottom-3 right-3 chip-red animate-pulse">▸ ACTIVE</span>
          <span *ngIf="g.isPrivate" class="absolute top-3 left-3 chip-yellow text-[10px]">🔒</span>
        </a>

        <div class="p-5 flex flex-col flex-1 min-h-0">
          <a [routerLink]="['/groups', g.id]"
             class="font-display text-xl font-bold mb-1 block hover:text-primary shrink-0">
            {{ g.name }}
          </a>
          <p class="text-xs text-ink-500 mb-3 shrink-0">{{ g.memberCount }} members</p>

          <p class="text-sm text-ink-600 line-clamp-2 min-h-[2.75rem] shrink-0">
            {{ g.description || '\u00a0' }}
          </p>

          <div class="flex-1 min-h-2"></div>

          <!-- Engagement bar -->
          <div class="mb-4 shrink-0">
            <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div class="h-full bg-primary"
                   [style.width]="engagement(g) + '%'"></div>
            </div>
            <p class="text-right text-xs text-ink-500 font-mono mt-1">{{ engagement(g) }}</p>
          </div>

          <div class="flex gap-2 items-stretch shrink-0">
            <a [routerLink]="['/groups', g.id]"
               class="btn-secondary flex-1 text-sm text-center flex items-center justify-center">
              Open
            </a>
            <button *ngIf="!g.isMember && !g.hasPendingRequest"
                    class="btn-primary flex-1 text-sm disabled:opacity-50"
                    [disabled]="g.moderationStatus !== 'APPROVED' || joining()[g.id]"
                    (click)="join(g); $event.stopPropagation()">
              {{ joining()[g.id] ? '…' : joinLabel(g) }}
            </button>
            <button *ngIf="g.hasPendingRequest"
                    class="btn-secondary flex-1 text-sm disabled:opacity-50"
                    [disabled]="joining()[g.id]"
                    (click)="cancelRequest(g); $event.stopPropagation()">
              {{ joining()[g.id] ? '…' : 'Cancel request' }}
            </button>
            <button *ngIf="g.isMember && !g.isOwner"
                    class="btn-secondary flex-1 text-sm disabled:opacity-50"
                    [disabled]="joining()[g.id]"
                    (click)="leave(g); $event.stopPropagation()">
              {{ joining()[g.id] ? '…' : 'Leave' }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <p *ngIf="!filteredGroups().length" class="card text-center text-ink-500 mt-6">
      No groups in this category.
      <a routerLink="/groups/new" class="text-primary font-semibold">Create the first one →</a>
    </p>
  `
})
export class GroupsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  protected groups = signal<Group[]>([]);
  protected activeFilter = signal<Filter>('all');
  protected joining = signal<Record<string, boolean>>({});
  protected query = '';
  private searchTimer?: ReturnType<typeof setTimeout>;

  protected filters: { id: Filter; label: string }[] = [
    { id: 'all',         label: 'All' },
    { id: 'PROMO',       label: 'By promo' },
    { id: 'SPECIALTY',   label: 'By specialty' },
    { id: 'REGION',      label: 'By region' },
    { id: 'INTEREST',    label: 'By interest' },
    { id: 'WOMEN',       label: 'Women in Tech' },
    { id: 'FOUNDERS',    label: 'Founders' },
    { id: 'MENTORSHIP',  label: 'Mentorship' }
  ];

  protected filteredGroups = computed(() => {
    const f = this.activeFilter();
    const all = this.groups();
    if (f === 'all') return all;
    if (f === 'WOMEN')      return all.filter(g => /women/i.test(g.name));
    if (f === 'FOUNDERS')   return all.filter(g => /founder/i.test(g.name));
    if (f === 'MENTORSHIP') return all.filter(g => /mentor/i.test(g.name));
    return all.filter(g => g.type === f);
  });

  ngOnInit(): void { this.refresh(); }

  search(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.refresh(), 300);
  }

  refresh(): void {
    const params = new URLSearchParams({ size: '50' });
    const q = this.query.trim();
    if (q) params.set('q', q);
    this.http.get<{ content: Group[] }>(`${environment.apiUrl}/groups?${params}`)
      .subscribe(r => this.groups.set(r.content ?? []));
  }

  join(g: Group): void {
    this.joining.update(s => ({ ...s, [g.id]: true }));
    this.http.post(`${environment.apiUrl}/groups/${g.id}/members`, {}).subscribe({
      next: () => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        if (g.isPrivate) {
          this.toast.success(`Join request sent to ${g.name}.`);
        } else {
          this.toast.success(`Joined ${g.name}.`);
        }
        this.refresh();
      },
      error: (err) => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not join.');
      }
    });
  }

  leave(g: Group): void {
    if (!confirm(`Leave ${g.name}?`)) return;
    this.joining.update(s => ({ ...s, [g.id]: true }));
    this.http.delete(`${environment.apiUrl}/groups/${g.id}/members`).subscribe({
      next: () => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        this.toast.info(`Left ${g.name}.`);
        this.refresh();
      },
      error: (err) => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not leave.');
      }
    });
  }

  cancelRequest(g: Group): void {
    this.joining.update(s => ({ ...s, [g.id]: true }));
    this.http.delete(`${environment.apiUrl}/groups/${g.id}/join-request`).subscribe({
      next: () => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        this.toast.success('Join request cancelled.');
        this.refresh();
      },
      error: (err) => {
        this.joining.update(s => ({ ...s, [g.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not cancel request.');
      }
    });
  }

  /** Stable gradient per group (deterministic from id). */
  gradientFor(i: number): string {
    return `bg-card-${(i % 6) + 1}`;
  }

  /** Mocked engagement score (0-100) deterministically from the group id. */
  engagement(g: Group): number {
    let hash = 0;
    for (const c of g.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return 50 + (Math.abs(hash) % 50);
  }

  isActive(g: Group): boolean {
    return this.engagement(g) > 85;
  }

  typeLabel(t: string): string {
    return ({
      PROMO:     'Promo',
      SPECIALTY: 'Specialty',
      REGION:    'Region',
      INTEREST:  'Interest',
    } as Record<string, string>)[t] ?? t;
  }

  joinLabel(g: Group): string {
    if (g.moderationStatus !== 'APPROVED') return 'Pending review';
    if (g.isPrivate) return 'Request';
    return 'Join';
  }
}
