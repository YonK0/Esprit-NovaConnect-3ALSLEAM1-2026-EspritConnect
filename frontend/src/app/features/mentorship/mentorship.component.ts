import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';
import { AvatarComponent } from '../../shared/avatar.component';

interface MentorProfile {
  id: string; userId: string; userEmail: string;
  bio?: string; expertiseAreas?: string[];
  availabilityHours?: number; acceptsFlash: boolean;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  firstName?: string; lastName?: string; headline?: string; avatarUrl?: string;
}

interface MyRequest {
  id: string; goals?: string;
  status: string; matchScore?: number;
}

interface IncomingRequest {
  id: string; menteeId: string; goals?: string;
  type: string; status: string; matchScore?: number;
}

@Component({
  selector: 'ec-mentorship',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarComponent],
  template: `
    <!-- Header -->
    <div class="flex justify-between items-end gap-4 mb-6">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ MENTORSHIP HUB</p>
        <h1 class="font-display text-3xl font-bold">
          Level up — with someone who shipped it.
        </h1>
      </div>
      <a *ngIf="canMentor()" routerLink="/mentorship/become" class="btn-primary">
        + Become a mentor
      </a>
    </div>

    <!-- Three tabs -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <button (click)="tab.set('find')"
              class="card text-left transition"
              [class.!bg-ink-900]="tab() === 'find'"
              [class.!text-white]="tab() === 'find'"
              [class.!border-ink-900]="tab() === 'find'">
        <p class="font-bold">Find a mentor</p>
        <p class="text-xs opacity-70">{{ mentors().length }} match(es)</p>
      </button>
      <a routerLink="/mentorship/become" class="card text-left no-underline text-inherit
                                                  hover:border-primary/40 transition block">
        <p class="font-bold">Become a mentor</p>
        <p class="text-xs text-ink-600">Set up your mentor profile →</p>
      </a>
      <button (click)="onMySessions()"
              class="card text-left hover:border-primary/40 transition">
        <p class="font-bold">My sessions</p>
        <p class="text-xs text-ink-600">{{ requests().length }} upcoming</p>
      </button>
    </div>

    <!-- Find tab -->
    <ng-container *ngIf="tab() === 'find'">
      <p *ngIf="featured() as m" class="text-xs font-mono text-primary mb-2">
        ▸ MATCH 01 OF {{ mentors().length }} · BASED ON YOUR GOALS
      </p>

      <article *ngIf="featured() as m"
               class="rounded-2xl bg-brand-red text-white relative overflow-hidden mb-6">
        <div class="p-8 relative">
          <p class="font-mono text-xs opacity-70">
            {{ specialtyFor(m) }} · {{ promoFor(m) }}
          </p>
          <div class="absolute right-8 top-8 text-right">
            <p class="font-display text-7xl font-bold leading-none">
              {{ matchPercent(m) }}<span class="text-2xl">%</span>
            </p>
          </div>
          <div class="absolute right-8 bottom-8 text-white opacity-60">
            <span class="text-3xl">▸</span>
          </div>
        </div>

        <div class="bg-white text-ink-800 p-6 relative">
          <div class="absolute -top-8 left-6 rounded-full ring-4 ring-white">
            <ec-avatar [url]="m.avatarUrl" [name]="shortName(m)" [size]="64"></ec-avatar>
          </div>

          <div class="ml-24 mb-5">
            <p class="font-display text-2xl font-bold flex flex-wrap items-center gap-2">
              {{ shortName(m) }}
              <span class="chip-red">{{ specialtyFor(m) }} · {{ promoFor(m) }}</span>
            </p>
            <p class="text-sm text-ink-600 mt-1">
              Mentor · {{ ratingFor(m) }}★ · {{ sessionsFor(m) }} sessions
            </p>
            <p class="text-sm text-ink-600">
              {{ m.bio || 'Available for mentorship — set up a session below.' }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4 mb-5">
            <div class="border border-ink-300 rounded-lg p-3">
              <p class="text-xs font-mono text-primary mb-2">SKILLS MATCH</p>
              <div class="flex flex-wrap gap-1">
                <span *ngFor="let s of (m.expertiseAreas || []).slice(0, 3)" class="chip-red">
                  ✓ {{ s }}
                </span>
                <span *ngIf="(m.expertiseAreas || []).length > 3" class="chip">
                  — {{ (m.expertiseAreas || [])[3] }}
                </span>
              </div>
            </div>

            <div class="border border-ink-300 rounded-lg p-3">
              <p class="text-xs font-mono text-primary mb-2">AVAILABILITY</p>
              <div class="flex gap-1 text-xs font-mono mb-2">
                <span *ngFor="let d of weekDays; let i = index"
                      class="w-6 h-6 flex items-center justify-center rounded"
                      [class.chip-red]="isAvailableDay(i)"
                      [class.chip]="!isAvailableDay(i)">
                  {{ d }}
                </span>
              </div>
              <p class="text-xs text-ink-500">
                ~{{ m.availabilityHours || 2 }}h / week · evenings GMT
              </p>
            </div>
          </div>

          <div class="rounded-lg bg-red-50 border border-primary/30 p-3 text-sm mb-5">
            <strong>Why {{ matchPercent(m) }}%:</strong>
            you both work on ML infrastructure, share
            {{ (m.expertiseAreas || []).length }} overlapping skills,
            and have mentored alumni transitioning to ML roles — your stated goal.
          </div>

          <div class="grid grid-cols-3 gap-2">
            <button (click)="onPass(m)" class="btn-secondary text-sm">× Pass</button>
            <button (click)="onSaveForLater(m)" class="btn-secondary text-sm">Save for later</button>
            <button (click)="onRequestSession(m)" class="btn-primary text-sm"
                    [disabled]="requesting()">
              ☼ {{ requesting() ? 'Requesting…' : 'Request a session' }}
            </button>
          </div>
        </div>
      </article>

      <h2 class="font-display text-xl font-bold mb-3" *ngIf="otherMentors().length">
        Other matches
      </h2>

      <div class="grid md:grid-cols-2 gap-4">
        <article *ngFor="let m of otherMentors()" class="card">
          <div class="flex items-start gap-3 mb-3">
            <ec-avatar [url]="m.avatarUrl" [name]="shortName(m)" [size]="48"></ec-avatar>
            <div class="flex-1 min-w-0">
              <p class="font-bold">{{ shortName(m) }}</p>
              <p class="text-xs text-ink-500">
                {{ specialtyFor(m) }} · {{ promoFor(m) }}
              </p>
            </div>
            <span class="chip-red font-display text-base !py-1 !px-2">
              {{ matchPercent(m) }}%
            </span>
          </div>
          <p *ngIf="m.bio" class="text-sm text-ink-600 mb-3 line-clamp-2">{{ m.bio }}</p>
          <div class="flex flex-wrap gap-1 mb-3">
            <span *ngFor="let s of (m.expertiseAreas || []).slice(0, 3)" class="chip-red">{{ s }}</span>
          </div>
          <p class="text-xs text-ink-500">
            ~{{ m.availabilityHours || 2 }}h / week
            <span *ngIf="m.acceptsFlash"> · flash sessions ⚡</span>
          </p>
        </article>
      </div>

      <p *ngIf="!mentors().length" class="card text-center text-ink-500 mt-6">
        No mentors yet. Be the first!
      </p>
    </ng-container>

    <div *ngIf="requests().length" class="card mt-8">
      <p class="text-xs font-mono text-primary mb-3">▸ MY REQUESTS (as mentee)</p>
      <ul class="divide-y divide-ink-300/30">
        <li *ngFor="let r of requests()" class="py-3 flex justify-between text-sm">
          <span>{{ r.goals }}</span>
          <span class="font-mono text-xs">
            {{ r.status }} · {{ r.matchScore ? (r.matchScore | percent) : '—' }}
          </span>
        </li>
      </ul>
    </div>

    <div *ngIf="incoming().length" class="card mt-8">
      <p class="text-xs font-mono text-primary mb-3">▸ INCOMING REQUESTS (you are the mentor)</p>
      <ul class="divide-y divide-ink-300/30">
        <li *ngFor="let r of incoming()" class="py-3 flex flex-col gap-2">
          <div class="flex justify-between items-start">
            <div>
              <p class="text-sm">{{ r.goals || '(no goals provided)' }}</p>
              <p class="text-xs font-mono text-ink-500 mt-1">
                {{ r.type }} · {{ r.status }}
              </p>
            </div>
            <div *ngIf="r.status === 'PENDING'" class="flex gap-2">
              <button class="btn-secondary text-xs"
                      [disabled]="updating()[r.id]"
                      (click)="updateRequestStatus(r, 'ACCEPTED')">
                {{ updating()[r.id] ? '…' : '✓ Accept' }}
              </button>
              <button class="btn-secondary text-xs"
                      [disabled]="updating()[r.id]"
                      (click)="updateRequestStatus(r, 'DECLINED')">
                {{ updating()[r.id] ? '…' : '× Decline' }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  `
})
export class MentorshipComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected mentors = signal<MentorProfile[]>([]);
  protected requests = signal<MyRequest[]>([]);
  protected incoming = signal<IncomingRequest[]>([]);
  protected tab = signal<'find' | 'become' | 'sessions'>('find');
  protected requesting = signal(false);
  protected updating = signal<Record<string, boolean>>({});

  onPass(m: MentorProfile): void {
    // Drop the mentor from the visible list — no backend, purely UX
    this.mentors.update(arr => arr.filter(x => x.id !== m.id));
    this.toast.info(`Passed on ${this.shortName(m)}.`);
  }

  onSaveForLater(m: MentorProfile): void {
    this.toast.soon('Saved mentors list');
  }

  onMySessions(): void {
    this.toast.soon('Session calendar view');
  }

  onRequestSession(m: MentorProfile): void {
    const goals = prompt(`What do you want help with from ${this.shortName(m)}? (one line)`);
    if (goals === null) return;
    this.requesting.set(true);
    this.http.post(`${environment.apiUrl}/mentorship/requests`, {
      mentorProfileId: m.id,
      goals: goals || '',
      type: 'FLASH'
    }).subscribe({
      next: () => {
        this.requesting.set(false);
        this.toast.success(`Request sent to ${this.shortName(m)}.`);
        this.http.get<MyRequest[]>(`${environment.apiUrl}/mentorship/requests/mine`)
          .subscribe(r => this.requests.set(r ?? []));
      },
      error: (err) => {
        this.requesting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not send request.');
      }
    });
  }

  protected weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  protected featured = computed(() => this.mentors()[0] ?? null);
  protected otherMentors = computed(() => this.mentors().slice(1));

  ngOnInit(): void {
    this.http.get<{ content: MentorProfile[] }>(
      `${environment.apiUrl}/mentorship/mentors?size=20`
    ).subscribe({
      next: r => this.mentors.set(r.content ?? []),
      error: () => {}
    });
    this.http.get<MyRequest[]>(`${environment.apiUrl}/mentorship/requests/mine`)
      .subscribe({ next: r => this.requests.set(r ?? []), error: () => {} });
    if (this.canMentor()) {
      this.http.get<IncomingRequest[]>(`${environment.apiUrl}/mentorship/requests/incoming`)
        .subscribe({ next: r => this.incoming.set(r ?? []), error: () => {} });
    }
  }

  updateRequestStatus(r: IncomingRequest, status: 'ACCEPTED' | 'DECLINED'): void {
    this.updating.update(s => ({ ...s, [r.id]: true }));
    this.http.patch(`${environment.apiUrl}/mentorship/requests/${r.id}/status`,
      { status }).subscribe({
      next: () => {
        this.updating.update(s => ({ ...s, [r.id]: false }));
        this.incoming.update(arr => arr.map(x => x.id === r.id ? { ...x, status } : x));
        this.toast.success(status === 'ACCEPTED' ? 'Request accepted.' : 'Request declined.');
      },
      error: (err) => {
        this.updating.update(s => ({ ...s, [r.id]: false }));
        this.toast.error(err?.error?.message ?? 'Status update failed.');
      }
    });
  }

  canMentor(): boolean {
    const r = this.auth.currentUser()?.role;
    return r === 'MENTOR' || r === 'ALUMNI' || r === 'ADMIN';
  }

  /** Stable mock match score derived from the mentor's id. */
  matchPercent(m: MentorProfile): number {
    let hash = 0;
    for (const c of m.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return 78 + (Math.abs(hash) % 18);
  }

  ratingFor(m: MentorProfile): number {
    let hash = 0;
    for (const c of m.id) hash = (hash * 17 + c.charCodeAt(0)) | 0;
    return 3 + (Math.abs(hash) % 3);
  }

  sessionsFor(m: MentorProfile): number {
    let hash = 0;
    for (const c of m.id) hash = (hash * 13 + c.charCodeAt(0)) | 0;
    return 5 + (Math.abs(hash) % 50);
  }

  specialtyFor(_m: MentorProfile): string { return 'IA'; }
  promoFor(_m: MentorProfile): string { return '2018'; }

  shortName(m: MentorProfile): string {
    const full = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
    if (full) return full;
    const name = m.userEmail.split('@')[0].replace(/\./g, ' ');
    return name.replace(/\b\w/g, c => c.toUpperCase());
  }

  initial(m: MentorProfile): string {
    return m.userEmail.charAt(0).toUpperCase();
  }

  isAvailableDay(i: number): boolean {
    return [0, 2, 3].includes(i);
  }
}
