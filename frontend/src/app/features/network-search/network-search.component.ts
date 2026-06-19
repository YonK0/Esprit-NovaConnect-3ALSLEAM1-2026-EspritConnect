import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';
import { debounceTime, Subject } from 'rxjs';

interface SearchResult {
  id: string;
  firstName: string;
  lastName: string;
  headline?: string;
  specialtyCode?: string;
  city?: string;
  country?: string;
  avatarUrl?: string;
}

@Component({
  selector: 'ec-network-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative">
      <!-- Search Input -->
      <div class="card flex items-center gap-2 !py-2.5 !px-4">
        <span class="text-ink-400">🔍</span>
        <input 
          class="flex-1 bg-transparent outline-none text-sm"
          type="text"
          [(ngModel)]="query"
          (ngModelChange)="onSearchChange($event)"
          placeholder="Find someone in the network..."
          (keydown.escape)="closeDropdown()"
          (blur)="closeDropdownDelayed()"
          (focus)="openDropdown()"
        />
        <button 
          *ngIf="query"
          (click)="clearSearch()"
          class="text-ink-400 hover:text-ink-600 text-sm">
          ✕
        </button>
      </div>

      <!-- Results Dropdown -->
      <div 
        *ngIf="showDropdown() && (results().length > 0 || loading())"
        class="absolute top-full left-0 right-0 mt-2 bg-white border border-ink-300/40 rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto">
        
        <!-- Loading state -->
        <div *ngIf="loading()" class="p-4 text-center text-sm text-ink-500">
          Searching...
        </div>

        <!-- Results -->
        <div *ngIf="!loading() && results().length > 0" class="divide-y divide-ink-100">
          <button 
            *ngFor="let result of results()"
            (click)="selectPerson(result)"
            class="w-full p-3 hover:bg-ink-50 transition text-left flex gap-3 items-start">
            <!-- Avatar -->
            <div 
              *ngIf="result.avatarUrl"
              class="w-10 h-10 rounded-full bg-primary/20 flex-shrink-0 overflow-hidden">
              <img [src]="result.avatarUrl" alt="avatar" class="w-full h-full object-cover" />
            </div>
            <div 
              *ngIf="!result.avatarUrl"
              class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
              {{ initials(result) }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm truncate">
                {{ result.firstName }} {{ result.lastName }}
              </p>
              <p class="text-xs text-ink-500 truncate" *ngIf="result.headline">
                {{ result.headline }}
              </p>
              <p class="text-xs text-ink-400">
                <span *ngIf="result.specialtyCode">{{ result.specialtyCode }}</span>
                <span *ngIf="result.city"> · {{ result.city }}</span>
                <span *ngIf="result.country">, {{ result.country }}</span>
              </p>
            </div>
          </button>
        </div>

        <!-- No results -->
        <div 
          *ngIf="!loading() && results().length === 0 && query.length > 0"
          class="p-4 text-center text-sm text-ink-500">
          No people found matching "{{ query }}"
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class NetworkSearchComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected query = '';
  protected results = signal<SearchResult[]>([]);
  protected loading = signal(false);
  protected showDropdown = signal(false);

  private searchSubject = new Subject<string>();

  constructor() {
    // Debounce search requests
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(q => {
      if (q.length >= 2) {
        this.performSearch(q);
      } else {
        this.results.set([]);
      }
    });
  }

  onSearchChange(value: string): void {
    this.query = value;
    if (value.length >= 2) {
      this.searchSubject.next(value);
    } else {
      this.results.set([]);
    }
  }

  private performSearch(query: string): void {
    this.loading.set(true);
    this.http.get<SearchResult[]>(`${environment.apiUrl}/directory/search`, {
      params: { q: query, limit: '10' }
    }).subscribe({
      next: (results) => {
        this.results.set(results);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.results.set([]);
      }
    });
  }

  selectPerson(person: SearchResult): void {
    this.router.navigateByUrl(`/profiles/${person.id}`);
    this.closeDropdown();
    this.clearSearch();
  }

  clearSearch(): void {
    this.query = '';
    this.results.set([]);
    this.showDropdown.set(false);
  }

  openDropdown(): void {
    if (this.query.length >= 2) {
      this.showDropdown.set(true);
    }
  }

  closeDropdown(): void {
    this.showDropdown.set(false);
  }

  closeDropdownDelayed(): void {
    setTimeout(() => this.closeDropdown(), 200);
  }

  protected initials(person: SearchResult): string {
    return (person.firstName?.[0] ?? '') + (person.lastName?.[0] ?? '');
  }
}
