import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast.service';

interface PermCol { code: string; label: string; }
interface MatrixResp {
  roles: string[];
  permissions: PermCol[];
  matrix: Record<string, Record<string, boolean>>;
}

@Component({
  selector: 'ec-admin-role-permissions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="text-xs font-mono text-primary mb-2">▸ ADMIN · ROLE PERMISSIONS</p>
    <h1 class="font-display text-3xl font-bold mb-2">Role permissions</h1>
    <p class="text-ink-300 text-sm mb-6 max-w-3xl">
      Toggle what each role can do by default. Changes apply to every user with
      that role. Per-user overrides (in <strong>Users → Permissions</strong>)
      still apply on top of this, and <strong>ADMIN</strong> always has full access.
    </p>

    <div *ngIf="error()" class="rounded-lg bg-red-900/30 border border-primary p-3 mb-4">
      <p class="text-sm text-primary">{{ error() }}</p>
    </div>

    <div *ngIf="data() as d"
         class="bg-ink-900/60 border border-primary/20 rounded-xl overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-ink-900 text-xs font-mono text-ink-300 uppercase">
          <tr>
            <th class="text-left px-4 py-3 sticky left-0 bg-ink-900">Permission</th>
            <th *ngFor="let r of d.roles" class="px-4 py-3 text-center">{{ r }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let p of d.permissions"
              class="border-t border-primary/10 hover:bg-ink-900/40">
            <td class="px-4 py-3 sticky left-0 bg-ink-900/80">
              <span class="font-semibold">{{ p.label }}</span>
              <span class="block text-ink-500 font-mono text-xs">{{ p.code }}</span>
            </td>
            <td *ngFor="let r of d.roles" class="px-4 py-3 text-center">
              <input type="checkbox"
                     class="w-4 h-4 accent-primary cursor-pointer disabled:opacity-40"
                     [checked]="d.matrix[r][p.code]"
                     [disabled]="busy()[r + ':' + p.code]"
                     (change)="setPerm(r, p.code, $any($event.target).checked)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p *ngIf="!data() && !error()" class="text-ink-300 text-sm font-mono">
      Loading role permissions…
    </p>
  `,
})
export class AdminRolePermissionsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  protected data = signal<MatrixResp | null>(null);
  protected error = signal<string | null>(null);
  protected busy = signal<Record<string, boolean>>({});

  ngOnInit(): void { this.load(); }

  load(): void {
    this.error.set(null);
    this.http.get<MatrixResp>(`${environment.apiUrl}/admin/role-permissions`).subscribe({
      next: (d) => this.data.set(d),
      error: (err) => this.error.set(err?.error?.message ?? 'Could not load role permissions.'),
    });
  }

  setPerm(role: string, code: string, allowed: boolean): void {
    const key = `${role}:${code}`;
    this.busy.update(b => ({ ...b, [key]: true }));
    const qs = new URLSearchParams({ role, code, allowed: String(allowed) }).toString();
    this.http.put(`${environment.apiUrl}/admin/role-permissions?${qs}`, {}).subscribe({
      next: () => {
        this.busy.update(b => ({ ...b, [key]: false }));
        this.data.update(d => d
          ? { ...d, matrix: { ...d.matrix, [role]: { ...d.matrix[role], [code]: allowed } } }
          : d);
        this.toast.success(`${role}: ${allowed ? 'allowed' : 'denied'} ${code}`);
      },
      error: (err) => {
        this.busy.update(b => ({ ...b, [key]: false }));
        this.toast.error(err?.error?.message ?? 'Could not update permission.');
        this.load();   // reload to revert the checkbox to the true state
      },
    });
  }
}
