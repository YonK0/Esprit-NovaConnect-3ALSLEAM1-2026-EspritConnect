import { Component, inject, OnInit, OnDestroy, signal, computed, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';
import { MessagingApi } from '../messaging/messaging.service';
import { VerifiedBadgeComponent } from '../../shared/verified-badge.component';
import { AvatarComponent } from '../../shared/avatar.component';

declare const L: any;

interface Profile {
  id: string; userId: string; firstName: string; lastName: string;
  headline?: string; city?: string; country?: string;
  promotionYear?: number; specialtyCode?: string; specialtyName?: string;
  avatarUrl?: string; identityVerified?: boolean; openToWork?: boolean;
  lat?: number; lng?: number;
}

const CITY_COORDS: Record<string, [number, number]> = {
  'tunis': [36.8065, 10.1815], 'sfax': [34.7400, 10.7600],
  'sousse': [35.8245, 10.6346], 'bizerte': [37.2744, 9.8739],
  'nabeul': [36.4561, 10.7376], 'monastir': [35.7643, 10.8113],
  'paris': [48.8566, 2.3522], 'lyon': [45.7640, 4.8357],
  'london': [51.5074, -0.1278], 'berlin': [52.5200, 13.4050],
  'madrid': [40.4168, -3.7038], 'dubai': [25.2048, 55.2708],
  'new york': [40.7128, -74.0060], 'montreal': [45.5017, -73.5673],
  'toronto': [43.6532, -79.3832], 'casablanca': [33.5731, -7.5898],
  'algiers': [36.7372, 3.0865], 'cairo': [30.0444, 31.2357],
  'geneva': [46.2044, 6.1432], 'zurich': [47.3769, 8.5417]
};

// Country centroids — fallback for members who set a country at signup but
// no city (or a city we don't have coordinates for). Keys are lowercased.
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'tunisia': [33.8869, 9.5375], 'france': [46.2276, 2.2137],
  'germany': [51.1657, 10.4515], 'canada': [56.1304, -106.3468],
  'united arab emirates': [23.4241, 53.8478], 'uae': [23.4241, 53.8478],
  'united kingdom': [55.3781, -3.4360], 'uk': [55.3781, -3.4360],
  'great britain': [55.3781, -3.4360],
  'united states': [37.0902, -95.7129], 'usa': [37.0902, -95.7129],
  'united states of america': [37.0902, -95.7129],
  'spain': [40.4637, -3.7492], 'italy': [41.8719, 12.5674],
  'belgium': [50.5039, 4.4699], 'switzerland': [46.8182, 8.2275],
  'netherlands': [52.1326, 5.2913], 'sweden': [60.1282, 18.6435],
  'qatar': [25.3548, 51.1839], 'saudi arabia': [23.8859, 45.0792],
  'morocco': [31.7917, -7.0926], 'algeria': [28.0339, 1.6596],
  'egypt': [26.8206, 30.8025], 'turkey': [38.9637, 35.2433],
  'turkiye': [38.9637, 35.2433], 'luxembourg': [49.8153, 6.1296],
};

@Component({
  selector: 'ec-directory',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, VerifiedBadgeComponent, AvatarComponent],
  template: `
    <!-- Page header -->
    <div class="flex justify-between items-end mb-6 flex-wrap gap-4">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ DIRECTORY</p>
        <h1 class="font-display text-4xl font-bold">Find your people.</h1>
        <p class="text-ink-600 text-sm mt-1">
          {{ totalCount() }} alumni · 89 countries · live index
        </p>
      </div>
      <div class="inline-flex rounded-lg border border-ink-300 bg-white p-1">
        <button class="px-3 py-1.5 rounded text-xs font-mono"
                [class.bg-ink-100]="view() === 'grid'"
                (click)="view.set('grid')">▦ Grid</button>
        <button class="px-3 py-1.5 rounded text-xs font-mono"
                [class.bg-ink-100]="view() === 'map'"
                (click)="switchToMap()">⌖ Map</button>
      </div>
    </div>

    <!-- Search + active-filter pill -->
    <div class="flex gap-3 mb-3">
      <div class="card flex-1 !py-2.5 !px-4 flex items-center gap-2">
        <span class="text-ink-500">🔍</span>
        <input class="flex-1 bg-transparent outline-none text-sm" type="text"
               [(ngModel)]="query" (ngModelChange)="search()"
               placeholder="Search alumni by name, headline, skill..." />
        <span class="text-xs font-mono text-ink-500">
          {{ results().length }} matches
        </span>
      </div>
      <button (click)="filtersOpen.set(!filtersOpen())"
              class="card !py-2.5 !px-4 flex items-center gap-2 hover:border-primary/40"
              [class.border-primary]="activeFilterCount() > 0">
        <span class="text-primary">▽</span>
        <span class="text-sm font-mono">Filters · {{ activeFilterCount() }}</span>
      </button>
    </div>

    <!-- Filter panel (collapsible) -->
    <div *ngIf="filtersOpen()" class="card mb-4 space-y-3">
      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label class="text-xs font-mono text-ink-500 mb-1 block">Specialty</label>
          <select class="field !py-2" [(ngModel)]="filterSpecialty" (ngModelChange)="search()">
            <option value="">All specialties</option>
            <option *ngFor="let s of specialties" [value]="s.code">{{ s.code }} — {{ s.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-mono text-ink-500 mb-1 block">Country</label>
          <input class="field !py-2" type="text" [(ngModel)]="filterCountry"
                 (ngModelChange)="search()" placeholder="Any country" list="ec-country-list" />
          <datalist id="ec-country-list">
            <option *ngFor="let c of commonCountries" [value]="c"></option>
          </datalist>
        </div>
        <div>
          <label class="text-xs font-mono text-ink-500 mb-1 block">City</label>
          <input class="field !py-2" type="text" [(ngModel)]="filterCity"
                 (ngModelChange)="search()" placeholder="Any city" />
        </div>
        <div>
          <label class="text-xs font-mono text-ink-500 mb-1 block">Promotion years</label>
          <div class="flex items-center gap-2">
            <input class="field !py-2 w-20" type="number" min="2000" max="2030"
                   [(ngModel)]="filterPromoMin" (ngModelChange)="search()" placeholder="from" />
            <span class="text-ink-500">→</span>
            <input class="field !py-2 w-20" type="number" min="2000" max="2030"
                   [(ngModel)]="filterPromoMax" (ngModelChange)="search()" placeholder="to" />
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button class="btn-secondary text-xs" (click)="clearFilters()">× Clear all</button>
        <button class="btn-primary text-xs ml-auto" (click)="filtersOpen.set(false)">Done</button>
      </div>
    </div>

    <!-- Map view -->
    <div *ngIf="view() === 'map'" id="ec-alumni-map"
         class="rounded-xl overflow-hidden border border-ink-300/40"
         style="height:480px"></div>

    <p *ngIf="loading() && view() === 'grid'" class="text-ink-500 text-sm">Loading...</p>

    <!-- Grid view -->
    <div *ngIf="view() === 'grid'" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      <article *ngFor="let p of results(); let i = index"
               class="card hover:border-primary/40 transition relative">
        <!-- HIRING badge -->
        <span *ngIf="isHiring(p)"
              class="absolute top-3 right-3 chip-red font-semibold">HIRING</span>

        <div class="flex items-start gap-4 mb-3">
          <ec-avatar [url]="p.avatarUrl" [name]="p.firstName + ' ' + p.lastName"
                     [size]="56" [openToWork]="!!p.openToWork"></ec-avatar>
          <div class="min-w-0">
            <a [routerLink]="['/profiles', p.userId]"
               class="font-bold hover:text-primary block truncate">
              {{ p.firstName }} {{ p.lastName }}
              <ec-verified-badge *ngIf="p.identityVerified" [size]="15"></ec-verified-badge>
            </a>
            <p class="text-sm text-ink-600 truncate">{{ p.headline || '—' }}</p>
            <p class="text-xs text-ink-500 mt-1">
              <span *ngIf="p.city" class="truncate">{{ p.city }}</span>
              <span *ngIf="p.country">, {{ p.country }}</span>
            </p>
          </div>
        </div>

        <!-- Skill chips row -->
        <div class="flex flex-wrap gap-1 mb-3 min-h-[26px]">
          <span *ngIf="p.specialtyCode" class="chip-red">{{ p.specialtyCode }}</span>
          <span *ngIf="p.promotionYear" class="chip">{{ p.promotionYear }}</span>
          <span *ngIf="p.headline" class="chip">{{ topicFromHeadline(p.headline) }}</span>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-2">
          <button (click)="onMessage(p)" class="btn-secondary text-xs py-1.5 px-3">Message</button>
          <a [routerLink]="['/profiles', p.userId]"
             class="btn-primary text-xs py-1.5 px-3 text-center">View profile</a>
        </div>
      </article>
    </div>

    <p *ngIf="!loading() && results().length === 0 && view() === 'grid'"
       class="card text-center text-ink-500">No matches.</p>
  `
})
export class DirectoryComponent implements OnInit, OnDestroy, AfterViewChecked {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private messaging = inject(MessagingApi);
  private router = inject(Router);

  protected query = '';
  protected view = signal<'grid' | 'map'>('grid');
  protected results = signal<Profile[]>([]);
  protected loading = signal(false);

  // Filter state
  protected filtersOpen = signal(false);
  protected filterSpecialty = '';
  protected filterCountry = '';
  protected filterCity = '';
  protected filterPromoMin: number | null = null;
  protected filterPromoMax: number | null = null;

  protected specialties = [
    { code: 'GL',         label: 'Génie Logiciel' },
    { code: 'IA',         label: 'Intelligence Artificielle' },
    { code: 'RT',         label: 'Réseaux & Télécoms' },
    { code: 'INFOTRONIC', label: 'Infotronic' },
    { code: 'CIVIL',      label: 'Génie Civil' },
    { code: 'MECA',       label: 'Génie Mécanique' },
  ];
  protected commonCountries = [
    'Tunisia', 'France', 'Germany', 'Canada', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Spain', 'Italy', 'Belgium', 'Switzerland',
  ];

  private map: any = null;
  private mapNeedsInit = false;

  onMessage(p: Profile): void {
    this.messaging.findOrCreate(p.userId).subscribe({
      next: ({ conversationId }) => {
        this.router.navigate(['/messaging', conversationId]);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Could not open conversation.');
      }
    });
  }

  clearFilters(): void {
    this.filterSpecialty = '';
    this.filterCountry = '';
    this.filterCity = '';
    this.filterPromoMin = null;
    this.filterPromoMax = null;
    this.search();
  }

  switchToMap(): void {
    this.view.set('map');
    this.mapNeedsInit = true;
  }

  protected activeFilterCount = computed(() => {
    // Count actually-applied filters (query is reflected in the search bar
    // separately, so it's NOT counted toward the filter chip).
    let n = 0;
    if (this.filterSpecialty) n++;
    if (this.filterCountry.trim()) n++;
    if (this.filterCity.trim()) n++;
    if (this.filterPromoMin != null) n++;
    if (this.filterPromoMax != null) n++;
    return n;
  });
  protected totalCount = signal('—');

  ngOnInit(): void { this.search(); }

  ngOnDestroy(): void {
    if (this.map) { this.map.remove(); this.map = null; }
  }

  ngAfterViewChecked(): void {
    if (this.mapNeedsInit && this.view() === 'map') {
      const container = document.getElementById('ec-alumni-map');
      if (container && typeof L !== 'undefined') {
        this.mapNeedsInit = false;
        this.initMap(container);
      }
    }
  }

  private initMap(container: HTMLElement): void {
    if (this.map) { this.map.remove(); }
    this.map = L.map(container).setView([36.8, 10.2], 3);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(this.map);

    // Group members by a resolved coordinate: prefer their city, fall back to
    // their country so members who only set a country (e.g. at signup) still
    // appear on the map.
    const buckets: Record<string, { coords: [number, number]; profiles: Profile[] }> = {};
    for (const p of this.results()) {
      const city = (p.city ?? '').toLowerCase().trim();
      const country = (p.country ?? '').toLowerCase().trim();
      const coords = (city && CITY_COORDS[city])
        ? CITY_COORDS[city]
        : (country ? COUNTRY_COORDS[country] : undefined);
      if (!coords) continue;
      const key = coords[0] + ',' + coords[1];
      if (!buckets[key]) buckets[key] = { coords, profiles: [] };
      buckets[key].profiles.push(p);
    }

    for (const b of Object.values(buckets)) {
      const popup = b.profiles.map(p =>
        `<b>${p.firstName} ${p.lastName}</b><br/>${p.headline ?? ''}`
      ).join('<hr/>');
      L.circleMarker(b.coords, {
        radius: 6 + Math.min(b.profiles.length, 10),
        color: '#E63946', fillColor: '#E63946', fillOpacity: 0.7, weight: 2
      }).bindPopup(popup).addTo(this.map);
    }

    // Add a default Tunis marker if nothing plotted at all.
    if (Object.keys(buckets).length === 0) {
      L.circleMarker([36.8065, 10.1815], {
        radius: 8, color: '#E63946', fillColor: '#E63946', fillOpacity: 0.7, weight: 2
      }).bindPopup('ESPRIT University — Tunis').addTo(this.map);
    }
  }

  search(): void {
    this.loading.set(true);
    const params = new URLSearchParams();
    params.set('q', this.query);
    params.set('size', '100');
    if (this.filterSpecialty) params.set('specialty', this.filterSpecialty);
    if (this.filterCountry.trim()) params.set('country', this.filterCountry.trim());
    if (this.filterCity.trim()) params.set('city', this.filterCity.trim());
    if (this.filterPromoMin != null) params.set('promotionYearMin', String(this.filterPromoMin));
    if (this.filterPromoMax != null) params.set('promotionYearMax', String(this.filterPromoMax));

    this.http.get<{ content: Profile[]; totalElements?: number }>(
      `${environment.apiUrl}/profiles?${params.toString()}`
    ).subscribe({
      next: (r) => {
        this.results.set(r.content ?? []);
        if (r.totalElements != null) this.totalCount.set(r.totalElements.toLocaleString());
        this.loading.set(false);
        if (this.map) {
          this.map.remove();
          this.map = null;
          this.mapNeedsInit = true;
        }
      },
      error: () => { this.loading.set(false); }
    });
  }

  initials(p: Profile): string {
    return `${(p.firstName?.[0] ?? '').toUpperCase()}${(p.lastName?.[0] ?? '').toUpperCase()}`;
  }

  avatarColor(i: number): string {
    const palette = ['#9F5468', '#7A5A8E', '#3C8A87', '#86773C', '#6B5B95', '#A0522D', '#5F8B7D'];
    return palette[i % palette.length];
  }

  isHiring(p: Profile): boolean {
    return /hiring|recruit/i.test(p.headline ?? '');
  }

  topicFromHeadline(h: string): string {
    const lower = h.toLowerCase();
    if (lower.includes('ml')   || lower.includes('machine')) return 'ML';
    if (lower.includes('react') || lower.includes('front'))  return 'Frontend';
    if (lower.includes('platform') || lower.includes('infra')) return 'Platform';
    if (lower.includes('data'))                              return 'Data';
    if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) return 'Mobile';
    return h.split(/\s+/)[0];
  }
}
