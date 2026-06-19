import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProfileApi } from './profile.service';
import {
  Achievement, Experience, MutualConnection, Profile, SharedGroup, Skill
} from './profile.types';
import { AuthService } from '../../core/services/auth.service';
import { MessagingApi } from '../messaging/messaging.service';
import { ConnectionApi, ConnectionState } from '../connection/connection.service';
import { ToastService } from '../../shared/toast.service';
import { VerifiedBadgeComponent } from '../../shared/verified-badge.component';
import { AvatarComponent } from '../../shared/avatar.component';

@Component({
  selector: 'ec-public-profile',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, VerifiedBadgeComponent, AvatarComponent],
  template: `
    <ng-container *ngIf="profile() as p">
      <!-- Header (centered, social-media style) -->
      <section class="card !p-0 overflow-hidden mb-6">
        <div class="h-32 sm:h-44 bg-brand-red"></div>

        <div class="px-6 pb-6 -mt-16 flex flex-col items-center text-center">
          <div class="rounded-full bg-white p-1 shadow-md">
            <ec-avatar [url]="p.avatarUrl" [name]="p.firstName + ' ' + p.lastName"
                       [size]="128" [openToWork]="!!p.openToWork"></ec-avatar>
          </div>

          <h1 class="font-display text-2xl sm:text-3xl font-bold mt-3
                     flex items-center justify-center gap-2">
            {{ p.firstName }} {{ p.lastName }}
            <ec-verified-badge *ngIf="p.identityVerified" [size]="22"></ec-verified-badge>
          </h1>

          <p *ngIf="p.headline" class="text-ink-600 mt-1 max-w-xl">{{ p.headline }}</p>

          <p class="text-xs text-ink-500 mt-2 font-mono">
            <span *ngIf="p.specialtyCode">{{ p.specialtyCode }}</span>
            <span *ngIf="p.promotionYear"> · PROMO {{ p.promotionYear }}</span>
            <span *ngIf="p.city"> · {{ p.city }}</span>
            <span *ngIf="p.country">, {{ p.country }}</span>
          </p>

          <!-- Actions -->
          <div class="flex flex-wrap items-center justify-center gap-2 mt-4">
            <a *ngIf="p.cvUrl" [href]="p.cvUrl" target="_blank" class="btn-secondary btn-sm">
              ⬇ View CV
            </a>
            <button (click)="openConversation(p)" class="btn-secondary btn-sm"
                    [disabled]="messaging_loading()">
              {{ messaging_loading() ? '…' : 'Message' }}
            </button>

            <ng-container [ngSwitch]="connState()?.state">
              <button *ngSwitchCase="'NONE'"
                      (click)="inviteOpen.set(true)" class="btn-primary btn-sm"
                      [disabled]="connBusy()">
                + {{ connBusy() ? '…' : 'Connect' }}
              </button>
              <button *ngSwitchCase="'OUTGOING_PENDING'"
                      (click)="cancelConnect()" class="btn-secondary btn-sm"
                      [disabled]="connBusy()">
                ⏳ Request sent — cancel
              </button>
              <ng-container *ngSwitchCase="'INCOMING_PENDING'">
                <button (click)="acceptConnect()" class="btn-primary btn-sm"
                        [disabled]="connBusy()">✓ Accept</button>
                <button (click)="declineConnect()" class="btn-secondary btn-sm"
                        [disabled]="connBusy()">× Decline</button>
              </ng-container>
              <span *ngSwitchCase="'ACCEPTED'"
                    class="chip-green !text-sm !px-3 !py-1.5">✓ Connected</span>
              <span *ngSwitchCase="'SELF'"
                    class="text-xs text-ink-500">This is you</span>
            </ng-container>
          </div>
        </div>
      </section>

      <div class="grid lg:grid-cols-[1fr_320px] gap-6">
        <div class="space-y-6">
          <section class="card">
            <p class="text-xs font-mono text-primary mb-2">▸ ABOUT</p>
            <p class="text-ink-800 whitespace-pre-wrap">
              {{ p.bio || '—' }}
            </p>
          </section>

          <section class="card">
            <p class="text-xs font-mono text-primary mb-3">▸ EXPERIENCE</p>
            <p *ngIf="experiences().length === 0" class="text-ink-500 text-sm">No experience listed.</p>
            <ol class="space-y-4">
              <li *ngFor="let e of experiences()" class="flex gap-3">
                <div class="w-10 h-10 rounded bg-primary/10 text-primary
                            flex items-center justify-center font-mono text-xs shrink-0">
                  {{ (e.company || '').charAt(0) }}
                </div>
                <div>
                  <p class="font-bold">{{ e.title }} · {{ e.company }}</p>
                  <p class="text-xs text-ink-500 font-mono">
                    {{ e.startDate | date:'MMM yyyy' }} —
                    {{ e.endDate ? (e.endDate | date:'MMM yyyy') : 'Present' }}
                    <span *ngIf="e.location"> · {{ e.location }}</span>
                  </p>
                  <p *ngIf="e.description" class="text-sm text-ink-600 mt-1 whitespace-pre-wrap">
                    {{ e.description }}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <section class="card">
            <p class="text-xs font-mono text-primary mb-2">▸ SKILLS & RECOMMENDATIONS</p>
            <p *ngIf="connState()?.state !== 'SELF' && connState()?.state !== 'ACCEPTED'"
               class="text-xs text-ink-500 mb-3">
              Connect or accept a mentorship to recommend skills.
            </p>
            <p *ngIf="skills().length === 0" class="text-ink-500 text-sm">No skills listed.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div *ngFor="let s of skills()"
                   class="p-3 rounded-lg border border-ink-300/50">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-primary shrink-0">▸</span>
                    <span class="font-semibold text-sm truncate">{{ s.name }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs shrink-0">
                    <button *ngIf="s.canEndorse"
                            (click)="recommend(s)" [disabled]="busy()[s.id]"
                            class="text-primary font-semibold hover:underline disabled:opacity-50">
                      + Recommend
                    </button>
                    <button *ngIf="s.endorsedByMe"
                            (click)="removeRecommend(s)" [disabled]="busy()[s.id]"
                            class="text-green-700 font-semibold hover:underline disabled:opacity-50">
                      ✓ Recommended
                    </button>
                    <span *ngIf="s.endorsementCount > 0" class="font-mono text-ink-500">
                      {{ s.endorsementCount }} ★
                    </span>
                  </div>
                </div>
                <p *ngIf="s.endorsers?.length" class="text-xs text-ink-500 mt-2 pl-5">
                  Recommended by
                  <span *ngFor="let e of s.endorsers; let last = last">
                    {{ e.firstName }} {{ e.lastName }}<span *ngIf="!last">, </span>
                  </span>
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-4">
          <div class="card">
            <p class="text-xs font-mono text-primary mb-3">▸ ACHIEVEMENTS</p>
            <p *ngIf="achievements().length === 0" class="text-ink-500 text-sm">None yet.</p>
            <ul class="space-y-3">
              <li *ngFor="let a of achievements()" class="flex gap-3">
                <span class="text-primary">🏆</span>
                <div>
                  <p class="font-semibold text-sm">{{ a.title }}</p>
                  <p class="text-xs text-ink-500">{{ a.subtitle }}</p>
                </div>
              </li>
            </ul>
          </div>

          <div class="card">
            <p class="text-xs font-mono text-primary mb-3">
              ▸ MUTUAL CONNECTIONS · {{ mutuals().length }}
            </p>
            <ul *ngIf="mutuals().length" class="space-y-2 text-sm">
              <li *ngFor="let m of mutuals() | slice:0:6"
                  class="flex items-center gap-2 text-ink-700">
                <span class="w-7 h-7 rounded-full bg-ink-300 flex items-center
                             justify-center font-mono text-xs">
                  {{ (m.firstName || '')[0] }}{{ (m.lastName || '')[0] }}
                </span>
                <span class="truncate">{{ m.firstName }} {{ m.lastName }}</span>
              </li>
            </ul>
            <p *ngIf="!mutuals().length" class="text-ink-500 text-xs">No mutual connections yet.</p>
          </div>

          <div class="card">
            <p class="text-xs font-mono text-primary mb-3">▸ SHARED GROUPS</p>
            <ul *ngIf="sharedGroups().length" class="space-y-2 text-sm">
              <li *ngFor="let g of sharedGroups()" class="text-ink-700">
                ▸ {{ g.name }}
              </li>
            </ul>
            <p *ngIf="!sharedGroups().length" class="text-ink-500 text-xs">No groups in common.</p>
          </div>
        </aside>
      </div>
    </ng-container>

    <p *ngIf="!profile()" class="text-ink-500 text-sm">Loading...</p>

    <!-- LinkedIn-style invite modal: optional personal note -->
    <div *ngIf="inviteOpen() && profile() as p"
         class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
         (click)="closeInviteIfBackdrop($event)">
      <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl"
           (click)="$event.stopPropagation()">
        <header class="px-5 py-4 border-b border-ink-300/40 flex justify-between items-center">
          <h3 class="font-display font-bold">
            Invite {{ p.firstName }} to connect
          </h3>
          <button (click)="inviteOpen.set(false)"
                  class="text-ink-400 hover:text-ink-700 text-2xl leading-none">×</button>
        </header>
        <div class="p-5 space-y-3">
          <p class="text-sm text-ink-600">
            Add a note to help {{ p.firstName }} remember how you know each other (optional, max 300 chars).
          </p>
          <textarea class="field" rows="4" maxlength="300"
                    [(ngModel)]="inviteMessage"
                    placeholder="Hi {{ p.firstName }}, I'd love to connect because…"></textarea>
          <p class="text-xs text-ink-500 text-right font-mono">
            {{ (inviteMessage.length) }} / 300
          </p>
          <div class="flex gap-2 pt-2">
            <button class="btn-secondary flex-1" (click)="inviteOpen.set(false)">Cancel</button>
            <button class="btn-primary flex-1"
                    [disabled]="connBusy()"
                    (click)="sendConnect(p)">
              {{ connBusy() ? 'Sending…' : 'Send invitation' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PublicProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ProfileApi);
  private auth = inject(AuthService);
  private messaging = inject(MessagingApi);
  private connections = inject(ConnectionApi);
  private toast = inject(ToastService);

  protected profile = signal<Profile | null>(null);
  protected experiences = signal<Experience[]>([]);
  protected skills = signal<Skill[]>([]);
  protected achievements = signal<Achievement[]>([]);
  protected mutuals = signal<MutualConnection[]>([]);
  protected sharedGroups = signal<SharedGroup[]>([]);
  protected busy = signal<Record<string, boolean>>({});
  protected connState = signal<ConnectionState | null>(null);
  protected connBusy = signal(false);
  protected messaging_loading = signal(false);
  protected inviteOpen = signal(false);
  protected inviteMessage = '';

  protected initials = computed(() => {
    const p = this.profile();
    return p ? (p.firstName?.[0] ?? '') + (p.lastName?.[0] ?? '') : '';
  });

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId) return;
    this.api.byUserId(userId).subscribe(p => {
      this.profile.set(p);
      this.api.experiences(p.id).subscribe(x => this.experiences.set(x));
      this.api.skills(p.id).subscribe(x => this.skills.set(x));
      this.api.achievements(p.id).subscribe(x => this.achievements.set(x));
    });
    this.api.mutualConnections(userId).subscribe(x => this.mutuals.set(x));
    this.api.sharedGroups(userId).subscribe(x => this.sharedGroups.set(x));
    this.connections.state(userId).subscribe({
      next: s => this.connState.set(s),
      error: () => this.connState.set({ state: 'NONE', connectionId: null })
    });
  }

  // ---------------- Message ----------------

  openConversation(p: Profile): void {
    this.messaging_loading.set(true);
    this.messaging.findOrCreate(p.userId).subscribe({
      next: ({ conversationId }) => {
        this.messaging_loading.set(false);
        this.router.navigate(['/messaging', conversationId]);
      },
      error: (err) => {
        this.messaging_loading.set(false);
        this.toast.error(err?.error?.message ?? 'Could not open conversation.');
      }
    });
  }

  // ---------------- Connect ----------------

  private otherUserId(): string | null {
    return this.profile()?.userId ?? null;
  }

  closeInviteIfBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.inviteOpen.set(false);
  }

  sendConnect(p: Profile): void {
    this.connBusy.set(true);
    this.connections.request(p.userId, this.inviteMessage.trim() || undefined).subscribe({
      next: (row) => {
        this.connBusy.set(false);
        this.inviteOpen.set(false);
        this.inviteMessage = '';
        this.connState.set({ state: 'OUTGOING_PENDING', connectionId: row.id });
        this.toast.success(`Connection request sent to ${p.firstName} ${p.lastName}.`);
      },
      error: (err) => {
        this.connBusy.set(false);
        this.toast.error(err?.error?.message ?? 'Could not send request.');
      }
    });
  }

  cancelConnect(): void {
    const id = this.connState()?.connectionId;
    if (!id) return;
    this.connBusy.set(true);
    this.connections.cancel(id).subscribe({
      next: () => {
        this.connBusy.set(false);
        this.connState.set({ state: 'NONE', connectionId: null });
        this.toast.info('Request cancelled.');
      },
      error: (err) => {
        this.connBusy.set(false);
        this.toast.error(err?.error?.message ?? 'Could not cancel.');
      }
    });
  }

  acceptConnect(): void {
    const id = this.connState()?.connectionId;
    if (!id) return;
    this.connBusy.set(true);
    this.connections.accept(id).subscribe({
      next: (row) => {
        this.connBusy.set(false);
        this.connState.set({ state: 'ACCEPTED', connectionId: row.id });
        this.toast.success('Connected!');
      },
      error: (err) => {
        this.connBusy.set(false);
        this.toast.error(err?.error?.message ?? 'Could not accept.');
      }
    });
  }

  declineConnect(): void {
    const id = this.connState()?.connectionId;
    if (!id) return;
    this.connBusy.set(true);
    this.connections.decline(id).subscribe({
      next: () => {
        this.connBusy.set(false);
        this.connState.set({ state: 'DECLINED', connectionId: id });
        this.toast.info('Request declined.');
      },
      error: (err) => {
        this.connBusy.set(false);
        this.toast.error(err?.error?.message ?? 'Could not decline.');
      }
    });
  }

  private reloadSkills(): void {
    const p = this.profile();
    if (p) this.api.skills(p.id).subscribe(x => this.skills.set(x));
  }

  recommend(s: Skill): void {
    this.busy.update(b => ({ ...b, [s.id]: true }));
    this.api.endorse(s.id).subscribe({
      next: () => {
        this.busy.update(b => ({ ...b, [s.id]: false }));
        this.reloadSkills();
        this.toast.success('Skill recommended.');
      },
      error: (err) => {
        this.busy.update(b => ({ ...b, [s.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not recommend this skill.');
      }
    });
  }

  removeRecommend(s: Skill): void {
    this.busy.update(b => ({ ...b, [s.id]: true }));
    this.api.removeEndorse(s.id).subscribe({
      next: () => {
        this.busy.update(b => ({ ...b, [s.id]: false }));
        this.reloadSkills();
        this.toast.info('Recommendation removed.');
      },
      error: (err) => {
        this.busy.update(b => ({ ...b, [s.id]: false }));
        this.toast.error(err?.error?.message ?? 'Could not remove recommendation.');
      }
    });
  }
}
