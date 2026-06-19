import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface AttendeePreview {
  userId: string;
  name: string;
  avatarUrl?: string | null;
}

interface EventModel {
  id: string; title: string; description?: string; startAt: string;
  endAt?: string | null;
  location?: string; meetingUrl?: string | null; bannerUrl?: string; capacity?: number;
  organizerId: string; goingCount: number; virtual: boolean;
  maybeCount?: number;
  seatsRemaining?: number | null;
  viewerRsvp?: 'GOING' | 'MAYBE' | 'NOT_GOING' | null;
  moderationStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  goingPreview?: AttendeePreview[];
}

interface CalDay {
  date: Date;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  key: string;
}

interface CalBar {
  event: EventModel;
  colStart: number;
  colSpan: number;
  lane: number;
  showTitle: boolean;
  roundLeft: boolean;
  roundRight: boolean;
}

interface CalWeek {
  days: CalDay[];
  bars: CalBar[];
  laneCount: number;
}

@Component({
  selector: 'ec-events',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, NgClass],
  template: `
    <!-- Header -->
    <div class="flex justify-between items-end gap-4 mb-6">
      <div>
        <p class="text-xs font-mono text-primary mb-2">▸ EVENTS</p>
        <h1 class="font-display text-3xl font-bold">Where alumni show up.</h1>
      </div>
      <div class="flex items-center gap-3">
        <div class="inline-flex rounded-lg border border-ink-300 bg-white p-1">
          <button class="px-3 py-1.5 rounded text-xs font-mono"
                  [class.bg-ink-100]="view() === 'cards'"
                  (click)="view.set('cards')">Cards</button>
          <button class="px-3 py-1.5 rounded text-xs font-mono"
                  [class.bg-ink-100]="view() === 'calendar'"
                  (click)="onCalendar()">Calendar</button>
        </div>
        <a routerLink="/events/manage" class="btn-secondary">⚙ Manage mine</a>
        <a routerLink="/events/new" class="btn-primary">+ Create event</a>
      </div>
    </div>

    <!-- Cards grid -->
    <div *ngIf="view() === 'cards'" class="grid md:grid-cols-3 gap-4">
      <article *ngFor="let e of events(); let i = index"
               class="rounded-xl overflow-hidden bg-white shadow-sm border border-ink-300/40">
        <div class="h-40 p-5 text-white relative overflow-hidden"
             [ngClass]="e.bannerUrl ? '' : gradientFor(i)">
          <img *ngIf="e.bannerUrl" [src]="e.bannerUrl" alt=""
               class="absolute inset-0 w-full h-full object-cover" />
          <div *ngIf="e.bannerUrl" class="absolute inset-0 bg-black/40"></div>
          <div class="relative z-10 h-full">
            <p class="text-xs font-mono opacity-70">{{ e.startAt | date:'MMM' | uppercase }}</p>
            <p class="font-display text-5xl font-bold mt-2 leading-none">
              {{ e.startAt | date:'dd' }}
            </p>
            <span class="absolute top-0 right-0 chip !bg-white/15 !text-white">
              {{ e.virtual ? 'Virtual' : 'In-person' }}
            </span>
            <span *ngIf="e.moderationStatus !== 'APPROVED'"
                  class="absolute bottom-0 left-0 chip-yellow text-[10px]">
              {{ e.moderationStatus }}
            </span>
          </div>
        </div>
        <div class="p-4">
          <h3 class="font-display text-lg font-bold mb-1">{{ e.title }}</h3>
          <p class="text-xs text-ink-500 mb-3">
            📍 {{ e.virtual ? 'Online' : (e.location || 'TBD') }}
          </p>
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2 min-w-0">
              <div *ngIf="goingAvatars(e).length" class="avatar-stack flex shrink-0">
                <ng-container *ngFor="let a of goingAvatars(e)">
                  <img *ngIf="a.avatarUrl" [src]="a.avatarUrl" [alt]="a.name"
                       class="w-7 h-7 rounded-full object-cover border-2 border-white" />
                  <span *ngIf="!a.avatarUrl"
                        class="avatar-dot w-7 h-7 text-[10px] border-2 border-white"
                        [style.background]="avatarColorFor(a.userId)">
                    {{ initials(a.name) }}
                  </span>
                </ng-container>
              </div>
              <p class="text-xs text-ink-500 truncate">
                {{ e.goingCount }} going
                <span *ngIf="e.seatsRemaining != null"
                      class="ml-1"
                      [class.text-primary]="e.seatsRemaining! <= 5">
                  · {{ e.seatsRemaining }} seat{{ e.seatsRemaining === 1 ? '' : 's' }} left
                </span>
              </p>
            </div>
            <span class="chip-red shrink-0 text-[10px] font-mono whitespace-nowrap ml-2">
              {{ eventDateRange(e) }}
            </span>
          </div>
          <div *ngIf="e.moderationStatus === 'APPROVED'"
               class="flex gap-1 rounded-lg border border-ink-300 p-0.5">
            <button *ngFor="let s of rsvpStates"
                    (click)="onRsvp(e, s.value)"
                    class="flex-1 text-xs py-1.5 rounded font-semibold transition"
                    [class.bg-primary]="e.viewerRsvp === s.value"
                    [class.text-white]="e.viewerRsvp === s.value"
                    [class.text-ink-700]="e.viewerRsvp !== s.value"
                    [class.hover:bg-ink-100]="e.viewerRsvp !== s.value"
                    [disabled]="rsvping()[e.id] || (s.value === 'GOING' && isAtCapacity(e) && e.viewerRsvp !== 'GOING')">
              {{ rsvping()[e.id] && pendingForState(e, s.value) ? '…' : s.label }}
            </button>
          </div>
          <p *ngIf="e.moderationStatus === 'PENDING'"
             class="text-[10px] text-ink-500 text-center font-mono">
            Pending admin review
          </p>
          <p *ngIf="e.viewerRsvp && e.moderationStatus === 'APPROVED'"
             class="text-[10px] text-ink-500 mt-1 text-center font-mono">
            ✓ Saved · awaiting organizer approval
          </p>
        </div>
      </article>
    </div>

    <!-- Calendar — Teams-style continuous multi-day bars -->
    <div *ngIf="view() === 'calendar'" class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4 px-1">
        <button (click)="changeMonth(-1)" class="btn-secondary text-sm">← Prev</button>
        <h2 class="font-display text-xl font-bold">{{ monthLabel() }}</h2>
        <button (click)="changeMonth(1)" class="btn-secondary text-sm">Next →</button>
      </div>

      <div class="grid grid-cols-7 text-xs font-mono text-ink-500 text-center border-b border-ink-300/40 pb-2">
        <div *ngFor="let d of weekDayLabels">{{ d }}</div>
      </div>

      <div *ngFor="let week of calendarWeeks()" class="border-b border-ink-300/40 last:border-b-0">
        <div class="grid grid-cols-7 gap-0"
             [style.gridTemplateRows]="'auto' + (week.laneCount ? ' repeat(' + week.laneCount + ', 18px)' : '')">
          <!-- Day numbers (row 1) -->
          <div *ngFor="let day of week.days"
               class="border-r border-ink-300/40 last:border-r-0 p-1.5 min-h-[2rem]"
               [class.bg-ink-100]="!day.inMonth"
               [class.bg-red-50]="day.isToday">
            <p class="text-xs font-mono leading-none"
               [class.text-ink-300]="!day.inMonth"
               [class.text-primary]="day.isToday"
               [class.font-bold]="day.isToday">
              {{ day.dayOfMonth }}
            </p>
          </div>

          <!-- Continuous event bars (rows 2+) -->
          <div *ngFor="let bar of week.bars"
               [style.gridColumn]="(bar.colStart + 1) + ' / span ' + bar.colSpan"
               [style.gridRow]="bar.lane + 1"
               class="h-[18px] text-[10px] text-white truncate cursor-pointer
                      flex items-center px-1.5 leading-none self-center
                      hover:brightness-110 transition"
               [ngClass]="{
                 'bg-primary': bar.event.moderationStatus === 'APPROVED',
                 'bg-yellow-600': bar.event.moderationStatus === 'PENDING',
                 'bg-ink-400': bar.event.moderationStatus === 'REJECTED',
                 'rounded-l': bar.roundLeft,
                 'rounded-r': bar.roundRight
               }"
               [title]="eventSpanTitle(bar.event)"
               (click)="focusEvent(bar.event)">
            <span *ngIf="bar.showTitle">{{ bar.event.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <p *ngIf="!events().length" class="card text-center text-ink-500 mt-6">
      No upcoming events. Create the first one!
    </p>
  `
})
export class EventsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  protected events = signal<EventModel[]>([]);
  protected view = signal<'cards' | 'calendar'>('cards');
  protected rsvping = signal<Record<string, boolean>>({});

  protected rsvpStates: { value: 'GOING' | 'MAYBE' | 'NOT_GOING'; label: string }[] = [
    { value: 'GOING',     label: '✓ Going' },
    { value: 'MAYBE',     label: '? Maybe' },
    { value: 'NOT_GOING', label: '× No' },
  ];

  pendingForState(e: EventModel, value: 'GOING' | 'MAYBE' | 'NOT_GOING'): boolean {
    return this.rsvping()[e.id] === true && e.viewerRsvp !== value;
  }

  onRsvp(e: EventModel, status: 'GOING' | 'MAYBE' | 'NOT_GOING'): void {
    if (e.moderationStatus !== 'APPROVED') {
      this.toast.info('RSVPs open once an admin approves this event.');
      return;
    }
    this.rsvping.update(s => ({ ...s, [e.id]: true }));
    this.http.post(`${environment.apiUrl}/events/${e.id}/rsvp`, { status }).subscribe({
      next: () => {
        this.http.get<EventModel>(`${environment.apiUrl}/events/${e.id}`).subscribe({
          next: fresh => {
            this.rsvping.update(s => ({ ...s, [e.id]: false }));
            this.toast.success(`RSVP saved: ${status}.`);
            this.events.update(arr => arr.map(ev => ev.id === e.id ? fresh : ev));
          },
          error: () => this.rsvping.update(s => ({ ...s, [e.id]: false }))
        });
      },
      error: (err) => {
        this.rsvping.update(s => ({ ...s, [e.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not RSVP.');
      }
    });
  }

  isAtCapacity(e: EventModel): boolean {
    return e.seatsRemaining === 0 && e.viewerRsvp !== 'GOING';
  }

  onCalendar(): void {
    this.view.set('calendar');
  }

  protected calendarCursor = signal<{ year: number; month: number }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  });
  protected weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  protected monthLabel = computed(() =>
    new Date(this.calendarCursor().year, this.calendarCursor().month, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  );

  protected calendarWeeks = computed(() => {
    const days = this.buildCalendarDays();
    const weeks: CalWeek[] = [];
    for (let w = 0; w < 6; w++) {
      const weekDays = days.slice(w * 7, w * 7 + 7);
      const bars = this.buildWeekBars(weekDays);
      weeks.push({
        days: weekDays,
        bars,
        laneCount: bars.length ? Math.max(...bars.map(b => b.lane)) : 0
      });
    }
    return weeks;
  });

  private buildCalendarDays(): CalDay[] {
    const { year, month } = this.calendarCursor();
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: CalDay[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push({
        date: d,
        dayOfMonth: d.getDate(),
        inMonth: d.getMonth() === month,
        isToday: d.getTime() === today.getTime(),
        key: this.localDateKey(d)
      });
    }
    return days;
  }

  /** One continuous bar segment per event per week row (Teams-style). */
  private buildWeekBars(weekDays: CalDay[]): CalBar[] {
    type Seg = Omit<CalBar, 'lane'>;
    const segments: Seg[] = [];

    for (const e of this.events()) {
      const keySet = new Set(this.eventDateKeys(e));
      const eventStartKey = this.localDateKey(new Date(e.startAt));
      const keys = this.eventDateKeys(e);
      const eventEndKey = keys[keys.length - 1];

      const cols: number[] = [];
      for (let c = 0; c < 7; c++) {
        if (keySet.has(weekDays[c].key)) cols.push(c);
      }
      if (!cols.length) continue;

      let runStart = cols[0];
      let prev = cols[0];
      const runs: [number, number][] = [];
      for (let i = 1; i <= cols.length; i++) {
        if (i < cols.length && cols[i] === prev + 1) {
          prev = cols[i];
        } else {
          runs.push([runStart, prev]);
          if (i < cols.length) { runStart = cols[i]; prev = cols[i]; }
        }
      }

      for (const [start, end] of runs) {
        const firstKey = weekDays[start].key;
        const lastKey = weekDays[end].key;
        segments.push({
          event: e,
          colStart: start,
          colSpan: end - start + 1,
          roundLeft: firstKey === eventStartKey,
          roundRight: lastKey === eventEndKey,
          showTitle: firstKey === eventStartKey
        });
      }
    }

    segments.sort((a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan);
    const bars: CalBar[] = [];

    for (const seg of segments) {
      let lane = 1;
      while (!this.barFitsLane(bars, lane, seg.colStart, seg.colSpan)) lane++;
      bars.push({ ...seg, lane });
    }
    return bars;
  }

  private barFitsLane(bars: CalBar[], lane: number, colStart: number, colSpan: number): boolean {
    const colEnd = colStart + colSpan - 1;
    return !bars.some(b => {
      if (b.lane !== lane) return false;
      const bEnd = b.colStart + b.colSpan - 1;
      return !(colEnd < b.colStart || colStart > bEnd);
    });
  }

  private eventDateKeys(e: EventModel): string[] {
    const start = new Date(e.startAt);
    start.setHours(0, 0, 0, 0);
    const end = e.endAt ? new Date(e.endAt) : new Date(start);
    end.setHours(0, 0, 0, 0);
    if (end.getTime() < start.getTime()) end.setTime(start.getTime());

    const keys: string[] = [];
    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      keys.push(this.localDateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return keys;
  }

  private localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  eventSpanTitle(e: EventModel): string {
    const start = new Date(e.startAt).toLocaleDateString('en-US');
    const end = e.endAt ? new Date(e.endAt).toLocaleDateString('en-US') : start;
    const range = start === end ? start : `${start} – ${end}`;
    return `${e.title} (${range})`;
  }

  changeMonth(delta: number): void {
    this.calendarCursor.update(c => {
      let { year, month } = c;
      month += delta;
      if (month < 0) { month += 12; year--; }
      if (month > 11) { month -= 12; year++; }
      return { year, month };
    });
  }

  focusEvent(e: EventModel): void {
    this.view.set('cards');
    document.querySelector('ec-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  ngOnInit(): void {
    this.http.get<{ content: EventModel[] }>(`${environment.apiUrl}/events?size=20`)
      .subscribe(r => this.events.set(r.content ?? []));
  }

  gradientFor(i: number): string {
    return `bg-card-${(i % 6) + 1}`;
  }

  avatarColor(i: number): string {
    const palette = ['#9F5468', '#7A5A8E', '#3C8A87', '#86773C', '#6B5B95', '#A0522D'];
    return palette[i % palette.length];
  }

  goingAvatars(e: EventModel): AttendeePreview[] {
    return (e.goingPreview ?? []).slice(0, 3);
  }

  avatarColorFor(userId: string): string {
    let hash = 0;
    for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) | 0;
    return this.avatarColor(Math.abs(hash));
  }

  initials(name: string): string {
    return (name ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  /** e.g. "Jun 12" or "Jun 12–18" or "Jun 28 – Jul 2" */
  eventDateRange(e: EventModel): string {
    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : null;
    const sm = start.toLocaleDateString('en-US', { month: 'short' });
    const sd = start.getDate();
    if (!end || this.localDateKey(start) === this.localDateKey(end)) {
      return `${sm} ${sd}`;
    }
    const em = end.toLocaleDateString('en-US', { month: 'short' });
    const ed = end.getDate();
    if (sm === em) return `${sm} ${sd}–${ed}`;
    return `${sm} ${sd} – ${em} ${ed}`;
  }
}
