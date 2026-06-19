import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConnectionApi, ConnectionRow, SuggestedConnection } from './connection.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';
import { NetworkSearchComponent } from '../network-search/network-search.component';
import { AvatarComponent } from '../../shared/avatar.component';

@Component({
  selector: 'ec-network',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, NetworkSearchComponent, AvatarComponent],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ MY NETWORK</p>
    <h1 class="font-display text-3xl font-bold mb-2">Connections</h1>

    <!-- Network Search -->
    <div class="mb-8 max-w-md">
      <ec-network-search />
    </div>

    <p class="text-ink-600 text-sm mb-6">
      {{ counts().accepted }} connected ·
      {{ counts().pendingIncoming }} pending incoming ·
      {{ counts().pendingOutgoing }} pending outgoing
    </p>

    <!-- Tabs -->
    <div class="flex gap-2 mb-6">
      <button *ngFor="let t of tabs" (click)="tab.set(t.id)"
              class="px-4 py-1.5 rounded-full text-sm font-mono border transition"
              [class.bg-ink-900]="tab() === t.id"
              [class.text-white]="tab() === t.id"
              [class.border-ink-900]="tab() === t.id"
              [class.bg-white]="tab() !== t.id"
              [class.border-ink-300]="tab() !== t.id">
        {{ t.label }}
        <span *ngIf="t.badge()" class="ml-1 chip-red !py-0 !px-1.5">{{ t.badge() }}</span>
      </button>
    </div>

    <!-- Incoming -->
    <div *ngIf="tab() === 'incoming'" class="space-y-3">
      <article *ngFor="let c of incoming()" class="card flex items-center gap-3">
        <ec-avatar [url]="c.requesterAvatarUrl" [name]="c.requesterName || c.requesterEmail"
                   [size]="40"></ec-avatar>
        <div class="flex-1 min-w-0">
          <a [routerLink]="['/profiles', c.requesterUserId]"
             class="font-bold hover:text-primary block truncate">
            {{ c.requesterName || c.requesterEmail }}
          </a>
          <p class="text-xs text-ink-500">{{ c.createdAt | date:'short' }}</p>
        </div>
        <button (click)="accept(c)" class="btn-primary text-xs py-1.5 px-3"
                [disabled]="busy()[c.id]">
          ✓ Accept
        </button>
        <button (click)="decline(c)" class="btn-secondary text-xs py-1.5 px-3"
                [disabled]="busy()[c.id]">
          × Decline
        </button>
      </article>
      <p *ngIf="incoming().length === 0" class="card text-center text-ink-500">
        No incoming requests.
      </p>
    </div>

    <!-- Outgoing -->
    <div *ngIf="tab() === 'outgoing'" class="space-y-3">
      <article *ngFor="let c of outgoing()" class="card flex items-center gap-3">
        <ec-avatar [url]="c.addresseeAvatarUrl" [name]="c.addresseeName || c.addresseeEmail"
                   [size]="40"></ec-avatar>
        <div class="flex-1 min-w-0">
          <a [routerLink]="['/profiles', c.addresseeUserId]"
             class="font-bold hover:text-primary block truncate">
            {{ c.addresseeName || c.addresseeEmail }}
          </a>
          <p class="text-xs text-ink-500">Sent {{ c.createdAt | date:'short' }}</p>
        </div>
        <button (click)="cancel(c)" class="btn-secondary text-xs py-1.5 px-3"
                [disabled]="busy()[c.id]">
          Cancel
        </button>
      </article>
      <p *ngIf="outgoing().length === 0" class="card text-center text-ink-500">
        No outgoing requests.
      </p>
    </div>

    <!-- People you may know — LinkedIn-style suggestion card grid -->
    <section *ngIf="suggestions().length" class="mb-8">
      <p class="text-xs font-mono text-primary mb-3">▸ PEOPLE YOU MAY KNOW</p>
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        <article *ngFor="let s of suggestions()" class="card hover:border-primary/40 transition">
          <div class="flex items-start gap-3 mb-3">
            <ec-avatar [url]="s.avatarUrl" [name]="s.firstName + ' ' + s.lastName" [size]="48"></ec-avatar>
            <div class="min-w-0 flex-1">
              <a [routerLink]="['/profiles', s.userId]"
                 class="font-bold hover:text-primary block truncate">
                {{ s.firstName }} {{ s.lastName }}
              </a>
              <p class="text-xs text-ink-500 truncate">{{ s.headline || '—' }}</p>
              <p class="text-xs text-ink-500 font-mono mt-0.5">
                <span *ngIf="s.specialtyCode">{{ s.specialtyCode }}</span>
                <span *ngIf="s.promotionYear"> · '{{ s.promotionYear }}</span>
              </p>
            </div>
          </div>
          <p class="text-xs text-ink-500 mb-3 italic">{{ s.reason }}</p>
          <button class="btn-secondary w-full text-xs"
                  [disabled]="busy()[s.userId]"
                  (click)="connectTo(s)">
            {{ busy()[s.userId] ? '…' : '+ Connect' }}
          </button>
        </article>
      </div>
    </section>

    <!-- Accepted -->
    <div *ngIf="tab() === 'accepted'" class="space-y-3">
      <article *ngFor="let c of accepted()" class="card flex items-center gap-3">
        <ec-avatar [url]="otherAvatar(c)" [name]="otherName(c)" [size]="40"></ec-avatar>
        <div class="flex-1 min-w-0">
          <a [routerLink]="['/profiles', otherUserId(c)]"
             class="font-bold hover:text-primary block truncate">
            {{ otherName(c) }}
          </a>
          <p class="text-xs text-ink-500">Connected {{ c.createdAt | date:'mediumDate' }}</p>
        </div>
        <a [routerLink]="['/profiles', otherUserId(c)]"
           class="btn-secondary text-xs py-1.5 px-3">View profile</a>
      </article>
      <p *ngIf="accepted().length === 0" class="card text-center text-ink-500">
        No connections yet. Browse the directory.
      </p>
    </div>
  `
})
export class NetworkComponent implements OnInit {
  private api = inject(ConnectionApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected tab = signal<'incoming' | 'outgoing' | 'accepted'>('incoming');
  protected incoming = signal<ConnectionRow[]>([]);
  protected outgoing = signal<ConnectionRow[]>([]);
  protected accepted = signal<ConnectionRow[]>([]);
  protected suggestions = signal<SuggestedConnection[]>([]);
  protected counts = signal({ accepted: 0, pendingIncoming: 0, pendingOutgoing: 0 });
  protected busy = signal<Record<string, boolean>>({});

  protected tabs = [
    { id: 'incoming' as const, label: 'Incoming', badge: () => this.incoming().length || null },
    { id: 'outgoing' as const, label: 'Outgoing', badge: () => this.outgoing().length || null },
    { id: 'accepted' as const, label: 'Connected', badge: () => this.accepted().length || null }
  ];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.api.incoming().subscribe(r => this.incoming.set(r));
    this.api.outgoing().subscribe(r => this.outgoing.set(r));
    this.api.accepted().subscribe(r => this.accepted.set(r));
    this.api.counts().subscribe(c => this.counts.set(c));
    this.api.suggestions(9).subscribe({
      next: s => this.suggestions.set(s),
      error: () => {}
    });
  }

  connectTo(s: SuggestedConnection): void {
    this.setBusy(s.userId, true);
    this.api.request(s.userId).subscribe({
      next: () => {
        this.setBusy(s.userId, false);
        this.suggestions.update(arr => arr.filter(x => x.userId !== s.userId));
        this.toast.success(`Request sent to ${s.firstName} ${s.lastName}.`);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(s.userId, false);
        this.toast.error(err?.error?.message ?? 'Could not send request.');
      }
    });
  }

  accept(c: ConnectionRow): void {
    this.setBusy(c.id, true);
    this.api.accept(c.id).subscribe({
      next: () => {
        this.setBusy(c.id, false);
        this.toast.success(`Accepted ${c.requesterEmail}.`);
        this.refresh();
      },
      error: () => {
        this.setBusy(c.id, false);
        this.toast.error('Could not accept.');
      }
    });
  }

  decline(c: ConnectionRow): void {
    this.setBusy(c.id, true);
    this.api.decline(c.id).subscribe({
      next: () => {
        this.setBusy(c.id, false);
        this.toast.info('Declined.');
        this.refresh();
      },
      error: () => {
        this.setBusy(c.id, false);
        this.toast.error('Could not decline.');
      }
    });
  }

  cancel(c: ConnectionRow): void {
    this.setBusy(c.id, true);
    this.api.cancel(c.id).subscribe({
      next: () => {
        this.setBusy(c.id, false);
        this.toast.info('Cancelled.');
        this.refresh();
      },
      error: () => {
        this.setBusy(c.id, false);
        this.toast.error('Could not cancel.');
      }
    });
  }

  /** Returns the email of the person who is NOT the current viewer. */
  otherEmail(c: ConnectionRow): string {
    const myId = this.auth.currentUser()?.userId;
    return c.requesterUserId === myId ? c.addresseeEmail : c.requesterEmail;
  }

  otherUserId(c: ConnectionRow): string {
    const myId = this.auth.currentUser()?.userId;
    return c.requesterUserId === myId ? c.addresseeUserId : c.requesterUserId;
  }

  /** Name of the person who is NOT the current viewer (falls back to email). */
  otherName(c: ConnectionRow): string {
    const myId = this.auth.currentUser()?.userId;
    return c.requesterUserId === myId
      ? (c.addresseeName || c.addresseeEmail)
      : (c.requesterName || c.requesterEmail);
  }

  otherAvatar(c: ConnectionRow): string | undefined {
    const myId = this.auth.currentUser()?.userId;
    return c.requesterUserId === myId ? c.addresseeAvatarUrl : c.requesterAvatarUrl;
  }

  initials(email: string): string {
    return email.slice(0, 2).toUpperCase();
  }

  private setBusy(id: string, value: boolean): void {
    this.busy.update(b => ({ ...b, [id]: value }));
  }
}
