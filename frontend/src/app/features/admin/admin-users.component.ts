import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  emailVerified: boolean;
  identityVerified: boolean;
  identityVerificationRequestedAt: string | null;
}

interface Page<T> { content: T[]; totalElements: number; }

@Component({
  selector: 'ec-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · USERS</p>
    <h1 class="font-display text-3xl font-bold mb-6">User management</h1>

    <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-4">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <div class="bg-ink-900/60 border border-primary/20 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-ink-900 text-xs font-mono text-ink-300 uppercase">
          <tr>
            <th class="text-left px-4 py-3">Email</th>
            <th class="text-left px-4 py-3">Role</th>
            <th class="text-left px-4 py-3">Status</th>
            <th class="text-left px-4 py-3">Verified</th>
            <th class="text-left px-4 py-3">Created</th>
            <th class="text-right px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngIf="loading()">
            <td colspan="6" class="px-4 py-6 text-center text-ink-300">Loading...</td>
          </tr>
          <tr *ngIf="!loading() && users().length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-ink-300">No users.</td>
          </tr>
          <ng-container *ngFor="let u of users()">
          <tr class="border-t border-primary/10 hover:bg-ink-900/40">
            <td class="px-4 py-3">{{ u.email }}</td>
            <td class="px-4 py-3">
              <select class="bg-ink-800 border border-primary/20 rounded px-2 py-1 text-xs font-mono
                             text-ink-100 focus:border-primary outline-none"
                      [value]="u.role"
                      (change)="changeRole(u, $any($event.target).value)"
                      [disabled]="busy()[u.id]">
                <option value="STUDENT">STUDENT</option>
                <option value="ALUMNI">ALUMNI</option>
                <option value="MENTOR">MENTOR</option>
                <option value="RECRUITER">RECRUITER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <span class="px-2 py-1 rounded text-xs font-mono"
                    [class.bg-yellow-900]="u.status === 'PENDING' || u.status === 'PENDING_APPROVAL'"
                    [class.text-yellow-200]="u.status === 'PENDING' || u.status === 'PENDING_APPROVAL'"
                    [class.bg-green-900]="u.status === 'ACTIVE'"
                    [class.text-green-200]="u.status === 'ACTIVE'"
                    [class.bg-red-900]="u.status === 'SUSPENDED'"
                    [class.text-red-200]="u.status === 'SUSPENDED'"
                    [class.bg-ink-700]="u.status === 'DRAFT' || u.status === 'VERIFYING' || u.status === 'VERIFICATION_FAILED'"
                    [class.text-ink-300]="u.status === 'DRAFT' || u.status === 'VERIFYING' || u.status === 'VERIFICATION_FAILED'">
                {{ u.status }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs font-mono"
                    [class.text-green-400]="u.emailVerified"
                    [class.text-ink-500]="!u.emailVerified">
                {{ u.emailVerified ? '✓ verified' : '✗ not verified' }}
              </span>
            </td>
            <td class="px-4 py-3 text-ink-300 text-xs">
              {{ u.createdAt | date:'MMM d, y' }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="flex flex-wrap gap-1 justify-end">
                <button *ngIf="u.status === 'PENDING' || u.status === 'PENDING_APPROVAL'"
                        (click)="approve(u)"
                        class="px-3 py-1 rounded bg-primary text-white text-xs font-semibold
                               hover:bg-primary-dark disabled:opacity-50"
                        [disabled]="busy()[u.id]">
                  {{ busy()[u.id] ? '…' : 'Approve' }}
                </button>
                <button *ngIf="u.status !== 'SUSPENDED'"
                        (click)="suspend(u)"
                        class="px-3 py-1 rounded border border-primary/50 text-primary text-xs
                               hover:bg-primary/10 disabled:opacity-50"
                        [disabled]="busy()[u.id]">
                  Suspend
                </button>
                <button *ngIf="u.status === 'SUSPENDED'"
                        (click)="approve(u)"
                        class="px-3 py-1 rounded border border-green-500/50 text-green-400 text-xs
                               hover:bg-green-900/20 disabled:opacity-50"
                        [disabled]="busy()[u.id]">
                  Re-activate
                </button>
                <button *ngIf="!u.emailVerified"
                        (click)="markEmailVerified(u)"
                        class="px-3 py-1 rounded border border-blue-400/50 text-blue-300 text-xs
                               hover:bg-blue-900/20 disabled:opacity-50"
                        [disabled]="busy()[u.id]"
                        title="Manually mark email as verified (admin override)">
                  ✓ Verify email
                </button>
                <button *ngIf="!u.identityVerified"
                        (click)="requestIdentityVerification(u)"
                        class="px-3 py-1 rounded border border-yellow-400/50 text-yellow-300 text-xs
                               hover:bg-yellow-900/20 disabled:opacity-50"
                        [disabled]="busy()[u.id]"
                        title="Email the user a link to complete identity verification">
                  🆔 Request ID verification
                </button>
                <button (click)="togglePerms(u.id)"
                        class="px-3 py-1 rounded border border-purple-500/40 text-purple-300 text-xs
                               hover:bg-purple-900/20"
                        title="Manage what this user is allowed to do">
                  🛡 Permissions
                </button>
                <button (click)="deleteUser(u)"
                        class="px-3 py-1 rounded border border-red-600/40 text-red-400 text-xs
                               hover:bg-red-900/20 disabled:opacity-50"
                        [disabled]="busy()[u.id]"
                        title="Permanently delete this user and all associated data">
                  🗑 Delete
                </button>
              </div>
            </td>
          </tr>
          <!-- Permissions sub-row -->
          <tr *ngIf="expandedPerms() === u.id" class="bg-ink-900/40 border-t border-primary/10">
            <td colspan="6" class="px-6 py-4">
              <p class="text-xs font-mono text-primary mb-3">▸ PERMISSIONS · {{ u.email }}</p>
              <p *ngIf="!permsLoading()[u.id] && permsCatalogue().length === 0"
                 class="text-xs text-ink-300">Loading permissions catalogue…</p>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <label *ngFor="let p of permsCatalogue()"
                       class="flex items-start gap-2 p-2 rounded border border-ink-700 cursor-pointer
                              hover:bg-ink-800 text-xs">
                  <input type="checkbox"
                         [checked]="!isRevoked(u.id, p.code)"
                         (change)="togglePerm(u, p, $any($event.target).checked)" />
                  <span [class.line-through]="isRevoked(u.id, p.code)"
                        [class.text-ink-500]="isRevoked(u.id, p.code)">
                    {{ p.label }}
                    <span class="text-ink-500 font-mono block">{{ p.code }}</span>
                  </span>
                </label>
              </div>
              <p class="mt-3 text-xs text-ink-400">
                ✓ checked = allowed (role default) ·
                □ unchecked = explicitly denied by admin
              </p>
            </td>
          </tr>
          </ng-container>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-ink-300 mt-4 font-mono">
      {{ users().length }} shown · total {{ total() }}
    </p>
  `
})
export class AdminUsersComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  protected users = signal<AdminUser[]>([]);
  protected total = signal(0);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected busy = signal<Record<string, boolean>>({});

  // Per-user permission UI state
  protected expandedPerms = signal<string | null>(null);
  protected permsCatalogue = signal<{ code: string; label: string }[]>([]);
  protected permsLoading = signal<Record<string, boolean>>({});
  // revoked[userId] = Set of revoked permission codes for that user
  protected revoked = signal<Record<string, Set<string>>>({});

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<Page<AdminUser>>(`${environment.apiUrl}/admin/users?size=50&sort=createdAt,desc`)
      .subscribe({
        next: (page) => {
          this.users.set(page.content ?? []);
          this.total.set(page.totalElements ?? 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Failed to load users.');
        }
      });
  }

  approve(u: AdminUser): void {
    this.setBusy(u.id, true);
    this.http.post(`${environment.apiUrl}/admin/users/${u.id}/activate`, {}).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.users.update(all => all.map(x => x.id === u.id ? { ...x, status: 'ACTIVE' } : x));
        this.toast.success(`${u.email} activated`);
      },
      error: (err) => {
        this.setBusy(u.id, false);
        this.toast.error(err?.error?.message ?? 'Action failed.');
      }
    });
  }

  suspend(u: AdminUser): void {
    if (!confirm(`Suspend ${u.email}?`)) return;
    this.setBusy(u.id, true);
    this.http.post(`${environment.apiUrl}/admin/users/${u.id}/suspend`, {}).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.users.update(all => all.map(x => x.id === u.id ? { ...x, status: 'SUSPENDED' } : x));
        this.toast.info(`Suspended ${u.email}`);
      },
      error: (err) => {
        this.setBusy(u.id, false);
        this.toast.error(err?.error?.message ?? 'Suspend failed.');
      }
    });
  }

  changeRole(u: AdminUser, newRole: string): void {
    if (newRole === u.role) return;
    if (newRole === 'ADMIN' &&
        !confirm(`Promote ${u.email} to ADMIN? They will get full administrator access to the panel.`)) {
      // Revert the <select> back to the user's current role.
      this.users.update(all => all.map(x => x.id === u.id ? { ...x } : x));
      return;
    }
    this.setBusy(u.id, true);
    this.http.patch(`${environment.apiUrl}/admin/users/${u.id}/role`, { role: newRole }).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.users.update(all => all.map(x => x.id === u.id ? { ...x, role: newRole } : x));
        this.toast.success(`Role changed to ${newRole}`);
      },
      error: (err) => {
        this.setBusy(u.id, false);
        this.toast.error(err?.error?.message ?? 'Role change failed.');
      }
    });
  }

  markEmailVerified(u: AdminUser): void {
    this.setBusy(u.id, true);
    this.http.patch(`${environment.apiUrl}/admin/users/${u.id}/email-verified?verified=true`, {}).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.users.update(all => all.map(x => x.id === u.id ? { ...x, emailVerified: true } : x));
        this.toast.success(`Email verified for ${u.email}`);
      },
      error: (err) => {
        this.setBusy(u.id, false);
        this.toast.error(err?.error?.message ?? 'Could not mark verified.');
      }
    });
  }

  /** Asks the user (by email) to complete identity verification.
   *  Optimistically flips the row's requested-at so the button hides
   *  immediately; the backend will email them and persist the timestamp. */
  requestIdentityVerification(u: AdminUser): void {
    if (!confirm(`Email ${u.email} a link to complete identity verification?`)) return;
    this.setBusy(u.id, true);
    this.http.post(`${environment.apiUrl}/admin/users/${u.id}/request-identity-verification`, {})
      .subscribe({
        next: () => {
          this.setBusy(u.id, false);
          this.users.update(all => all.map(x => x.id === u.id
            ? { ...x, identityVerificationRequestedAt: new Date().toISOString() }
            : x));
          this.toast.success(`Identity verification requested for ${u.email}`);
        },
        error: (err) => {
          this.setBusy(u.id, false);
          this.toast.error(err?.error?.message ?? 'Could not send the request.');
        },
      });
  }

  deleteUser(u: AdminUser): void {
    const confirmed = confirm(
      `Delete user "${u.email}" permanently? This action cannot be undone. All associated data will be removed.`
    );
    if (!confirmed) return;

    this.setBusy(u.id, true);
    this.http.delete(`${environment.apiUrl}/admin/users/${u.id}`).subscribe({
      next: () => {
        this.setBusy(u.id, false);
        this.users.update(all => all.filter(x => x.id !== u.id));
        this.total.update(t => Math.max(0, t - 1));
        this.toast.success(`${u.email} deleted`);
      },
      error: (err) => {
        this.setBusy(u.id, false);
        this.toast.error(err?.error?.message ?? 'Failed to delete user.');
      }
    });
  }

  // ── Permissions ────────────────────────────────────────────────────────

  togglePerms(userId: string): void {
    // Toggle expansion. Lazy-load the catalogue + this user's revocations.
    if (this.expandedPerms() === userId) {
      this.expandedPerms.set(null);
      return;
    }
    this.expandedPerms.set(userId);
    if (this.permsCatalogue().length === 0) {
      this.http.get<{ code: string; label: string }[]>(
        `${environment.apiUrl}/admin/permissions`
      ).subscribe({
        next: list => this.permsCatalogue.set(list),
        error: () => this.toast.error('Could not load permissions catalogue.')
      });
    }
    if (!this.revoked()[userId]) {
      this.permsLoading.update(s => ({ ...s, [userId]: true }));
      this.http.get<{ code: string }[]>(
        `${environment.apiUrl}/admin/users/${userId}/permissions`
      ).subscribe({
        next: rows => {
          this.revoked.update(r => ({ ...r, [userId]: new Set(rows.map(x => x.code)) }));
          this.permsLoading.update(s => ({ ...s, [userId]: false }));
        },
        error: () => {
          this.permsLoading.update(s => ({ ...s, [userId]: false }));
          this.toast.error('Could not load this user\'s permissions.');
        }
      });
    }
  }

  isRevoked(userId: string, code: string): boolean {
    return this.revoked()[userId]?.has(code) ?? false;
  }

  togglePerm(u: AdminUser, p: { code: string; label: string }, allowed: boolean): void {
    // allowed=true → restore (DELETE the revocation row)
    // allowed=false → revoke (POST a revocation row)
    if (allowed) {
      this.http.delete(`${environment.apiUrl}/admin/users/${u.id}/permissions/${p.code}`).subscribe({
        next: () => {
          this.revoked.update(r => {
            const next = { ...r };
            const set = new Set(next[u.id] ?? []);
            set.delete(p.code);
            next[u.id] = set;
            return next;
          });
          this.toast.success(`Allowed: ${p.label}`);
        },
        error: () => this.toast.error('Could not update permission.')
      });
    } else {
      const reason = prompt(`Why deny "${p.label}" for ${u.email}? (optional)`);
      const url = `${environment.apiUrl}/admin/users/${u.id}/permissions/revoke`
                + `?code=${p.code}` + (reason ? `&reason=${encodeURIComponent(reason)}` : '');
      this.http.post(url, {}).subscribe({
        next: () => {
          this.revoked.update(r => {
            const next = { ...r };
            const set = new Set(next[u.id] ?? []);
            set.add(p.code);
            next[u.id] = set;
            return next;
          });
          this.toast.info(`Denied: ${p.label}`);
        },
        error: () => this.toast.error('Could not update permission.')
      });
    }
  }

  private setBusy(id: string, value: boolean): void {
    this.busy.update(b => ({ ...b, [id]: value }));
  }
}
