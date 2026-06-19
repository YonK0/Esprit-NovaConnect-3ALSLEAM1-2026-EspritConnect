import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdminVerificationsApi, PendingVerification, VerificationDetail
} from './admin-verifications.service';
import { ToastService } from '../../../shared/toast.service';

type StatusFilter = 'ALL' | 'PENDING_APPROVAL' | 'PENDING' | 'VERIFICATION_FAILED' | 'DRAFT' | 'ACTIVE';

@Component({
  selector: 'ec-admin-verifications',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · PENDING VERIFICATIONS</p>
    <h1 class="font-display text-3xl font-bold mb-6">User registrations awaiting decision</h1>

    <!-- Status filter (client-side) -->
    <div class="flex flex-wrap gap-2 mb-6 text-xs font-mono">
      <button *ngFor="let s of filters"
              (click)="filter.set(s.value)"
              class="px-3 py-1.5 rounded border"
              [class.bg-primary]="filter() === s.value"
              [class.text-white]="filter() === s.value"
              [class.border-primary]="filter() === s.value"
              [class.bg-ink-900]="filter() !== s.value"
              [class.text-ink-100]="filter() !== s.value"
              [class.border-primary]="filter() !== s.value">
        {{ s.label }}
        <span *ngIf="counts()[s.value]" class="ml-1 opacity-70">{{ counts()[s.value] }}</span>
      </button>
    </div>

    <p *ngIf="loading()" class="text-ink-300 text-sm">Loading…</p>

    <div *ngIf="!loading() && filtered().length === 0"
         class="bg-ink-900/40 border border-primary/20 rounded-xl p-8 text-center text-ink-300">
      Nothing to review here. ✨
    </div>

    <div class="space-y-3">
      <article *ngFor="let v of filtered()"
               class="bg-ink-900/60 border border-primary/20 rounded-xl p-5">
        <div class="grid lg:grid-cols-[1fr_auto] gap-4">
          <!-- Identity -->
          <div>
            <div class="flex items-center gap-3 mb-2">
              <span class="w-10 h-10 rounded-full bg-primary flex items-center
                           justify-center font-mono text-xs text-white">
                {{ initials(v) }}
              </span>
              <div>
                <p class="font-bold">
                  {{ v.firstName }} {{ v.lastName }}
                  <span class="ml-2 chip-red font-mono">{{ v.role }}</span>
                  <span class="ml-1 font-mono text-xs"
                        [class.chip-yellow]="v.status === 'PENDING_APPROVAL' || v.status === 'PENDING'"
                        [class.chip-red]="v.status === 'VERIFICATION_FAILED'"
                        [class.chip-green]="v.status === 'ACTIVE'"
                        [class.chip]="v.status === 'DRAFT' || v.status === 'VERIFYING'">
                    {{ v.status === 'ACTIVE' ? 'ID RE-VERIFICATION' : v.status }}
                  </span>
                  <span *ngIf="v.identityVerified" class="ml-1 chip-green font-mono text-xs">
                    ✓ verified
                  </span>
                </p>
                <p class="text-xs text-ink-300">{{ v.email }}</p>
              </div>
            </div>
            <p class="text-xs text-ink-300 font-mono">
              <span *ngIf="v.specialtyCode">{{ v.specialtyCode }}</span>
              <span *ngIf="v.promotionYear"> · PROMO {{ v.promotionYear }}</span>
              <span> · signed up {{ v.signupAt | date:'short' }}</span>
              <span> · {{ v.attemptsCount }} attempt(s)</span>
            </p>

            <!-- Last attempt scores -->
            <div *ngIf="v.lastAttempt as la" class="mt-3 flex flex-wrap gap-2">
              <span *ngIf="la.nameMatchScore !== null"
                    class="chip-red">
                Name {{ la.nameMatchScore! | number:'1.0-2' }}
              </span>
              <span *ngIf="la.faceMatchScore !== null"
                    class="chip-red">
                Face {{ la.faceMatchScore! | number:'1.0-2' }}
              </span>
              <span *ngIf="la.livenessPassed !== null"
                    class="chip"
                    [class.chip-yellow]="!la.livenessPassed">
                Liveness: {{ la.livenessPassed ? '✓' : '✗' }}
              </span>
              <span class="chip">{{ la.step }} / {{ la.outcome }}</span>
            </div>
            <p *ngIf="v.lastAttempt?.rejectionReason"
               class="mt-2 text-xs text-primary italic">
              {{ v.lastAttempt?.rejectionReason }}
            </p>
            <p *ngIf="!v.lastAttempt"
               class="mt-3 text-xs text-ink-300 italic">
              Legacy signup — no verification chain.
            </p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col gap-2 shrink-0">
            <!-- Pending registration → approve / reject. -->
            <ng-container *ngIf="v.status !== 'ACTIVE'">
              <button class="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold
                             hover:bg-primary-dark disabled:opacity-50"
                      [disabled]="busy()[v.userId]"
                      (click)="approve(v)">
                {{ busy()[v.userId] ? '…' : '✓ Approve' }}
              </button>
              <button class="px-3 py-1.5 rounded border border-primary/50 text-primary text-xs
                             hover:bg-primary/10 disabled:opacity-50"
                      [disabled]="busy()[v.userId]"
                      (click)="reject(v)">
                × Reject
              </button>
            </ng-container>
            <!-- Admin-requested re-verification of an already-active member →
                 just acknowledge once the chain has been reviewed. -->
            <button *ngIf="v.status === 'ACTIVE'"
                    class="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold
                           hover:bg-primary-dark disabled:opacity-50"
                    [disabled]="busy()[v.userId]"
                    (click)="acknowledge(v)">
              {{ busy()[v.userId] ? '…' : '✓ Acknowledge' }}
            </button>
            <button class="px-3 py-1.5 rounded border border-ink-300/40 text-ink-300 text-xs
                           hover:text-ink-100"
                    (click)="openDetail(v.userId)">
              View chain
            </button>
          </div>
        </div>
      </article>
    </div>

    <!-- Detail modal: full audit chain -->
    <div *ngIf="detail() as d"
         class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
         (click)="detail.set(null)">
      <div class="bg-ink-900 text-ink-100 border border-primary/30 rounded-xl
                  max-w-2xl w-full max-h-[80vh] overflow-y-auto"
           (click)="$event.stopPropagation()">
        <header class="p-5 border-b border-primary/20 flex justify-between items-center">
          <div>
            <p class="text-xs font-mono text-primary">▸ AUDIT CHAIN</p>
            <h2 class="font-display text-xl font-bold">
              {{ d.user.firstName }} {{ d.user.lastName }}
            </h2>
            <p class="text-xs text-ink-300">{{ d.user.email }} · {{ d.user.role }}</p>
          </div>
          <button (click)="detail.set(null)" class="text-ink-300 hover:text-white">×</button>
        </header>
        <ol class="p-5 space-y-4">
          <li *ngFor="let h of d.history; let i = index"
              class="border-l-2 border-primary/40 pl-3">
            <p class="text-xs font-mono">
              #{{ i + 1 }} · {{ h.step }} · <span class="text-primary">{{ h.outcome }}</span>
              <span class="text-ink-300"> · {{ h.completedAt | date:'short' }}</span>
            </p>
            <p *ngIf="h.nameMatchScore !== null" class="text-xs text-ink-300">
              Name match: {{ h.nameMatchScore! | number:'1.0-2' }}
            </p>
            <p *ngIf="h.faceMatchScore !== null" class="text-xs text-ink-300">
              Face match: {{ h.faceMatchScore! | number:'1.0-2' }}
              · Liveness: {{ h.livenessPassed ? '✓' : '✗' }}
            </p>
            <p *ngIf="h.rejectionReason" class="text-xs text-primary italic mt-1">
              {{ h.rejectionReason }}
            </p>

            <!-- Documents: ID + optional secondary -->
            <div *ngIf="h.step === 'DOCUMENTS' && (h.idFileUrl || h.secondaryFileUrl)"
                 class="grid grid-cols-2 gap-2 mt-2">
              <a *ngIf="h.idFileUrl as u" [href]="u" target="_blank"
                 class="block border border-primary/20 rounded overflow-hidden">
                <img [src]="u" alt="ID document"
                     class="w-full h-32 object-cover bg-ink-800" />
                <p class="text-[10px] font-mono text-ink-300 px-2 py-1 truncate">ID</p>
              </a>
              <a *ngIf="h.secondaryFileUrl as u" [href]="u" target="_blank"
                 class="block border border-primary/20 rounded overflow-hidden">
                <img [src]="u" alt="Secondary document"
                     class="w-full h-32 object-cover bg-ink-800" />
                <p class="text-[10px] font-mono text-ink-300 px-2 py-1 truncate">Secondary</p>
              </a>
            </div>

            <!-- Face: 3 captured frames -->
            <div *ngIf="h.step === 'FACE' && h.frameUrls?.length"
                 class="grid grid-cols-3 gap-2 mt-2">
              <a *ngFor="let url of h.frameUrls; let fi = index"
                 [href]="url" target="_blank"
                 class="block border border-primary/20 rounded overflow-hidden">
                <img [src]="url" [alt]="'Frame ' + (fi + 1)"
                     class="w-full h-24 object-cover bg-ink-800" />
                <p class="text-[10px] font-mono text-ink-300 px-2 py-1">Frame {{ fi + 1 }}</p>
              </a>
            </div>
          </li>
          <li *ngIf="d.history.length === 0" class="text-xs text-ink-300 italic">
            No attempts recorded — this is a legacy direct signup.
          </li>
        </ol>
      </div>
    </div>
  `,
})
export class AdminVerificationsComponent implements OnInit {
  private api = inject(AdminVerificationsApi);
  private toast = inject(ToastService);

  protected items = signal<PendingVerification[]>([]);
  protected loading = signal(false);
  protected busy = signal<Record<string, boolean>>({});
  protected filter = signal<StatusFilter>('ALL');
  protected detail = signal<VerificationDetail | null>(null);

  protected filters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'PENDING_APPROVAL', label: 'Awaiting approval' },
    { value: 'PENDING', label: 'Legacy pending' },
    { value: 'VERIFICATION_FAILED', label: 'Failed' },
    { value: 'DRAFT', label: 'Draft / abandoned' },
    { value: 'ACTIVE', label: 'ID re-verifications' },
  ];

  protected counts = computed<Record<string, number>>(() => {
    const all = this.items();
    return {
      ALL: all.length,
      PENDING_APPROVAL: all.filter(x => x.status === 'PENDING_APPROVAL').length,
      PENDING: all.filter(x => x.status === 'PENDING').length,
      VERIFICATION_FAILED: all.filter(x => x.status === 'VERIFICATION_FAILED').length,
      DRAFT: all.filter(x => x.status === 'DRAFT' || x.status === 'VERIFYING').length,
      ACTIVE: all.filter(x => x.status === 'ACTIVE').length,
    };
  });

  protected filtered = computed(() => {
    const f = this.filter();
    if (f === 'ALL') return this.items();
    if (f === 'DRAFT') {
      return this.items().filter(x => x.status === 'DRAFT' || x.status === 'VERIFYING');
    }
    return this.items().filter(x => x.status === f);
  });

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.loading.set(true);
    this.api.list(0, 100).subscribe({
      next: (page) => {
        this.items.set(page.content ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load verifications.');
      },
    });
  }

  approve(v: PendingVerification): void {
    this.setBusy(v.userId, true);
    this.api.approve(v.userId).subscribe({
      next: () => {
        this.setBusy(v.userId, false);
        this.toast.success(`Approved ${v.email}`);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(v.userId, false);
        this.toast.error(err?.error?.message ?? 'Approve failed.');
      },
    });
  }

  reject(v: PendingVerification): void {
    const reason = prompt(`Reject ${v.email}? Provide a reason (sent to the user):`);
    if (!reason || !reason.trim()) {
      this.toast.info('Rejection cancelled — reason is required.');
      return;
    }
    this.setBusy(v.userId, true);
    this.api.reject(v.userId, reason.trim()).subscribe({
      next: () => {
        this.setBusy(v.userId, false);
        this.toast.info(`Rejected ${v.email}`);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(v.userId, false);
        this.toast.error(err?.error?.message ?? 'Reject failed.');
      },
    });
  }

  acknowledge(v: PendingVerification): void {
    this.setBusy(v.userId, true);
    this.api.acknowledge(v.userId).subscribe({
      next: () => {
        this.setBusy(v.userId, false);
        this.toast.success(`Acknowledged ${v.email}'s identity verification`);
        this.refresh();
      },
      error: (err) => {
        this.setBusy(v.userId, false);
        this.toast.error(err?.error?.message ?? 'Could not acknowledge.');
      },
    });
  }

  openDetail(userId: string): void {
    this.api.detail(userId).subscribe({
      next: (d) => this.detail.set(d),
      error: () => this.toast.error('Could not load audit chain.'),
    });
  }

  initials(v: PendingVerification): string {
    const a = (v.firstName?.[0] ?? '').toUpperCase();
    const b = (v.lastName?.[0] ?? '').toUpperCase();
    return (a + b) || v.email.slice(0, 2).toUpperCase();
  }

  private setBusy(id: string, value: boolean): void {
    this.busy.update(b => ({ ...b, [id]: value }));
  }
}
