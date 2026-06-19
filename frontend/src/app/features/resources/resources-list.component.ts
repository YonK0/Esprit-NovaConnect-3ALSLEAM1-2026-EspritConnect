import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ResourcesService, ResourceFolder, SortKey } from './resources.service';

@Component({
  selector: 'ec-resources-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- Header card -->
    <div class="card mb-6">
      <h1 class="font-display text-3xl font-bold mb-1">Resources</h1>
      <p class="text-ink-600">
        The space to organize all of your knowledge resources in a simple and intuitive way.
      </p>
    </div>

    <!-- Explorer card -->
    <div class="card">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <h2 class="font-display text-xl font-bold">Explore Folders</h2>

        <label class="flex items-center gap-2 text-sm text-ink-600 ml-1">
          <span class="font-mono text-xs">Sort:</span>
          <select class="field !py-1.5 !px-2 !w-auto text-sm" [(ngModel)]="sort">
            <option value="updated">Last updated</option>
            <option value="name">Name A–Z</option>
            <option value="created">Date created</option>
            <option value="items">Item count</option>
          </select>
        </label>

        <div class="ml-auto flex items-center gap-2">
          <div class="card flex items-center gap-2 !py-2 !px-3 !rounded-full">
            <span class="text-ink-500">🔍</span>
            <input class="bg-transparent outline-none text-sm w-48 md:w-64"
                   [(ngModel)]="query" placeholder="Search for a folder, file, link, etc." />
          </div>

          <div class="inline-flex rounded-lg border border-ink-300 bg-white p-1">
            <button class="px-2.5 py-1.5 rounded text-sm" title="Grid view"
                    [class.bg-ink-100]="view() === 'grid'" (click)="setView('grid')">▦</button>
            <button class="px-2.5 py-1.5 rounded text-sm" title="List view"
                    [class.bg-ink-100]="view() === 'list'" (click)="setView('list')">☰</button>
          </div>
        </div>
      </div>

      <!-- Loading skeletons -->
      <div *ngIf="loading()" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div *ngFor="let _ of [1,2,3,4,5,6]"
             class="h-48 rounded-xl bg-ink-100 animate-pulse"></div>
      </div>

      <!-- Empty state -->
      <div *ngIf="!loading() && filtered().length === 0"
           class="text-center text-ink-500 py-16">
        <p class="text-4xl mb-3">📂</p>
        <p class="font-semibold">No folders found</p>
        <p class="text-sm">{{ query ? 'Try a different search term.' : 'Resources will appear here.' }}</p>
      </div>

      <!-- GRID view -->
      <div *ngIf="!loading() && view() === 'grid' && filtered().length"
           class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <a *ngFor="let f of filtered()" [routerLink]="['/resources', f.id]"
           class="group relative block h-48 rounded-xl overflow-hidden border border-ink-300/40
                  shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition">
          <img *ngIf="f.coverImageUrl" [src]="f.coverImageUrl" alt="" (error)="f.coverImageUrl = ''"
               class="absolute inset-0 w-full h-full object-cover" />
          <div *ngIf="!f.coverImageUrl"
               class="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-glow"></div>
          <!-- bottom gradient for legibility -->
          <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent"></div>

          <span class="absolute top-3 left-3 text-[11px] font-mono text-white
                       bg-black/55 rounded px-2 py-1">
            {{ f.itemCount }} Items · {{ f.updatedAt | date:'d MMM. y' }}
          </span>

          <img *ngIf="f.ownerAvatarUrl" [src]="f.ownerAvatarUrl" alt=""
               class="absolute bottom-3 left-3 w-7 h-7 rounded-full ring-2 ring-white/80 object-cover" />

          <h3 class="absolute bottom-3 left-12 right-3 text-white font-semibold truncate">
            {{ f.title }}
          </h3>
        </a>
      </div>

      <!-- LIST view -->
      <div *ngIf="!loading() && view() === 'list' && filtered().length"
           class="divide-y divide-ink-200">
        <a *ngFor="let f of filtered()" [routerLink]="['/resources', f.id]"
           class="flex items-center gap-4 py-3 hover:bg-ink-50 -mx-2 px-2 rounded-lg transition">
          <div class="w-14 h-10 rounded-md overflow-hidden bg-ink-100 shrink-0">
            <img *ngIf="f.coverImageUrl" [src]="f.coverImageUrl" alt="" (error)="f.coverImageUrl = ''"
                 class="w-full h-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-semibold truncate">{{ f.title }}</p>
            <p class="text-xs text-ink-500">{{ f.itemCount }} items</p>
          </div>
          <span class="text-xs text-ink-500 font-mono shrink-0">{{ f.updatedAt | date:'mediumDate' }}</span>
        </a>
      </div>
    </div>
  `
})
export class ResourcesListComponent implements OnInit {
  private api = inject(ResourcesService);

  protected folders = signal<ResourceFolder[]>([]);
  protected loading = signal(true);

  /** Plain fields bound with ngModel; reflected into signals via setters. */
  private _query = signal('');
  private _sort = signal<SortKey>('updated');

  get query(): string { return this._query(); }
  set query(v: string) { this._query.set(v); }
  get sort(): SortKey { return this._sort(); }
  set sort(v: SortKey) { this._sort.set(v); }

  protected view = signal<'grid' | 'list'>(
    (localStorage.getItem('ec.resources.view') as 'grid' | 'list') || 'grid');

  protected filtered = computed(() => {
    const q = this._query().trim().toLowerCase();
    const sort = this._sort();
    let list = this.folders().filter(f =>
      !q || f.title.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'name': return a.title.localeCompare(b.title);
        case 'created': return +new Date(b.createdAt) - +new Date(a.createdAt);
        case 'items': return b.itemCount - a.itemCount;
        default: return +new Date(b.updatedAt) - +new Date(a.updatedAt);
      }
    });
    return list;
  });

  ngOnInit(): void {
    this.api.listFolders().subscribe({
      next: f => { this.folders.set(f); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  setView(v: 'grid' | 'list'): void {
    this.view.set(v);
    localStorage.setItem('ec.resources.view', v);
  }
}
