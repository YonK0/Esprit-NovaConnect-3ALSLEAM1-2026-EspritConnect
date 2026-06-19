import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface MyEvent {
  id: string; title: string; startAt: string; endAt?: string;
  location?: string; bannerUrl?: string;
  goingCount: number; maybeCount?: number;
  capacity?: number | null;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface Attendee {
  rsvpId: string; userId: string; email: string; name: string;
  status: 'GOING' | 'MAYBE' | 'NOT_GOING';
  approval: 'PENDING' | 'APPROVED' | 'REJECTED';
  respondedAt: string;
}

/**
 * Organizer dashboard.
 *
 *   /events/manage         → list every event I organize
 *   /events/manage/:id     → attendee list with approve / reject buttons
 *
 * Single component because the second view is just an in-place expansion
 * keyed off the optional :id route param.
 */
@Component({
  selector: 'ec-event-manage',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  template: `
    <div class="flex justify-between items-end mb-6 gap-4 flex-wrap">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ MANAGE MY EVENTS</p>
        <h1 class="font-display text-3xl font-bold">
          {{ selectedEventId() ? 'Attendees' : 'Events you organize' }}
        </h1>
        <p *ngIf="!selectedEventId()" class="text-sm text-ink-600">
          {{ myEvents().length }} event(s) total
        </p>
        <p *ngIf="selectedEvent() as e" class="text-sm text-ink-600">
          {{ e.title }} · {{ e.startAt | date:'mediumDate' }}
          <span *ngIf="e.location"> · 📍 {{ e.location }}</span>
        </p>
      </div>
      <div class="flex gap-2 flex-wrap">
        <a *ngIf="selectedEventId()" routerLink="/events/manage" class="btn-secondary">
          ← All events
        </a>
        <a routerLink="/events" class="btn-secondary">← Back to events</a>
        <a routerLink="/events/new" class="btn-primary">+ Create event</a>
      </div>
    </div>

    <!-- LIST VIEW -->
    <ng-container *ngIf="!selectedEventId()">
      <div *ngIf="loading()" class="card text-ink-500">Loading…</div>
      <p *ngIf="!loading() && myEvents().length === 0"
         class="card text-center text-ink-500">
        You haven't organized any events yet.
      </p>
      <div class="space-y-3">
        <article *ngFor="let e of myEvents()" class="card hover:shadow-md transition">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-ink-300/40
                        bg-primary/10 text-primary flex flex-col items-center justify-center font-mono text-xs">
              <img *ngIf="e.bannerUrl" [src]="e.bannerUrl" alt=""
                   class="w-full h-full object-cover" />
              <ng-container *ngIf="!e.bannerUrl">
                <span class="uppercase">{{ e.startAt | date:'MMM' }}</span>
                <span class="text-xl font-bold leading-none">{{ e.startAt | date:'d' }}</span>
              </ng-container>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-bold truncate">{{ e.title }}</h3>
              <p class="text-xs text-ink-500">
                {{ e.startAt | date:'mediumDate' }} · {{ e.startAt | date:'shortTime' }}
                <span *ngIf="e.location"> · 📍 {{ e.location }}</span>
              </p>
              <p class="text-xs font-mono text-ink-500 mt-1">
                {{ e.goingCount }} going
                <span *ngIf="e.capacity"> · {{ e.capacity }} cap</span>
                <span class="ml-2 px-2 py-0.5 rounded font-mono text-[10px]"
                      [class.bg-yellow-100]="e.moderationStatus === 'PENDING'"
                      [class.text-yellow-800]="e.moderationStatus === 'PENDING'"
                      [class.bg-green-100]="e.moderationStatus === 'APPROVED'"
                      [class.text-green-700]="e.moderationStatus === 'APPROVED'"
                      [class.bg-red-50]="e.moderationStatus === 'REJECTED'"
                      [class.text-primary]="e.moderationStatus === 'REJECTED'">
                  {{ e.moderationStatus }}
                </span>
              </p>
            </div>
            <a [routerLink]="['/events/manage', e.id]" class="btn-secondary text-xs shrink-0">
              👥 Manage attendees
            </a>
          </div>
        </article>
      </div>
    </ng-container>

    <!-- ATTENDEES VIEW -->
    <ng-container *ngIf="selectedEventId()">
      <div *ngIf="loadingAttendees()" class="card text-ink-500">Loading attendees…</div>

      <p *ngIf="!loadingAttendees() && attendees().length === 0"
         class="card text-center text-ink-500">
        No RSVPs yet for this event.
      </p>

      <!-- Counts -->
      <div *ngIf="attendees().length" class="flex flex-wrap gap-3 mb-4 text-sm">
        <span class="chip-red">{{ pendingCount() }} pending</span>
        <span class="chip">{{ approvedCount() }} approved</span>
        <span class="chip">{{ rejectedCount() }} rejected</span>
      </div>

      <div class="space-y-2">
        <article *ngFor="let a of attendees()"
                 class="card flex items-center gap-3 transition"
                 [class.opacity-60]="a.approval === 'REJECTED'">
          <div class="w-10 h-10 rounded-full bg-primary/15 text-primary
                      flex items-center justify-center font-mono shrink-0">
            {{ initials(a.name || a.email) }}
          </div>
          <div class="flex-1 min-w-0">
            <a [routerLink]="['/profiles', a.userId]"
               class="font-bold hover:text-primary block truncate">{{ a.name }}</a>
            <p class="text-xs text-ink-500 truncate">
              {{ a.email }} · RSVP {{ a.status }} on {{ a.respondedAt | date:'short' }}
            </p>
          </div>
          <span class="text-xs font-mono px-2 py-1 rounded shrink-0"
                [class.bg-yellow-100]="a.approval === 'PENDING'"
                [class.text-yellow-800]="a.approval === 'PENDING'"
                [class.bg-green-100]="a.approval === 'APPROVED'"
                [class.text-green-700]="a.approval === 'APPROVED'"
                [class.bg-red-50]="a.approval === 'REJECTED'"
                [class.text-primary]="a.approval === 'REJECTED'">
            {{ a.approval }}
          </span>
          <div class="flex gap-1 shrink-0" *ngIf="a.approval !== 'APPROVED'">
            <button class="btn-primary text-xs"
                    [disabled]="busy()[a.rsvpId]"
                    (click)="approve(a)">
              ✓ Approve
            </button>
          </div>
          <div class="flex gap-1 shrink-0" *ngIf="a.approval !== 'REJECTED'">
            <button class="btn-secondary text-xs"
                    [disabled]="busy()[a.rsvpId]"
                    (click)="reject(a)">
              × Reject
            </button>
          </div>
        </article>
      </div>
    </ng-container>
  `,
})
export class EventManageComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  protected myEvents = signal<MyEvent[]>([]);
  protected attendees = signal<Attendee[]>([]);
  protected loading = signal(false);
  protected loadingAttendees = signal(false);
  protected busy = signal<Record<string, boolean>>({});
  protected selectedEventId = signal<string | null>(null);

  protected selectedEvent = computed(() =>
    this.myEvents().find(e => e.id === this.selectedEventId()) ?? null);

  protected pendingCount  = computed(() => this.attendees().filter(a => a.approval === 'PENDING').length);
  protected approvedCount = computed(() => this.attendees().filter(a => a.approval === 'APPROVED').length);
  protected rejectedCount = computed(() => this.attendees().filter(a => a.approval === 'REJECTED').length);

  ngOnInit(): void {
    // The list-vs-detail mode flips on the `:id` param; subscribe so an
    // in-place navigation between the two re-loads correctly.
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      this.selectedEventId.set(id);
      if (id) this.loadAttendees(id);
    });
    this.loadEvents();
  }

  private loadEvents(): void {
    this.loading.set(true);
    this.http.get<{ content: MyEvent[] }>(`${environment.apiUrl}/events/mine?size=50`)
      .subscribe({
        next: r => { this.myEvents.set(r.content ?? []); this.loading.set(false); },
        error: () => { this.loading.set(false); this.toast.error('Could not load your events.'); }
      });
  }

  private loadAttendees(eventId: string): void {
    this.loadingAttendees.set(true);
    this.http.get<Attendee[]>(`${environment.apiUrl}/events/${eventId}/attendees/manage`)
      .subscribe({
        next: list => { this.attendees.set(list ?? []); this.loadingAttendees.set(false); },
        error: (err) => {
          this.loadingAttendees.set(false);
          this.toast.error(err?.error?.message ?? 'Could not load attendees.');
        }
      });
  }

  approve(a: Attendee): void {
    this.setBusy(a.rsvpId, true);
    this.http.post(`${environment.apiUrl}/events/rsvps/${a.rsvpId}/approve`, {}).subscribe({
      next: () => {
        this.setBusy(a.rsvpId, false);
        this.attendees.update(arr => arr.map(x =>
          x.rsvpId === a.rsvpId ? { ...x, approval: 'APPROVED' as const } : x));
        this.toast.success(`${a.name} confirmed — invite emailed.`);
      },
      error: (err) => {
        this.setBusy(a.rsvpId, false);
        this.toast.error(err?.error?.message ?? 'Could not approve.');
      }
    });
  }

  reject(a: Attendee): void {
    const reason = prompt(`Reject ${a.name}? Optional reason for the email:`);
    if (reason === null) return;   // user cancelled
    this.setBusy(a.rsvpId, true);
    this.http.post(`${environment.apiUrl}/events/rsvps/${a.rsvpId}/reject`,
      { reason }).subscribe({
      next: () => {
        this.setBusy(a.rsvpId, false);
        this.attendees.update(arr => arr.map(x =>
          x.rsvpId === a.rsvpId ? { ...x, approval: 'REJECTED' as const } : x));
        this.toast.info(`Rejection email sent to ${a.email}.`);
      },
      error: (err) => {
        this.setBusy(a.rsvpId, false);
        this.toast.error(err?.error?.message ?? 'Could not reject.');
      }
    });
  }

  initials(s: string): string { return (s ?? '').slice(0, 2).toUpperCase(); }

  private setBusy(id: string, v: boolean): void {
    this.busy.update(b => ({ ...b, [id]: v }));
  }
}
