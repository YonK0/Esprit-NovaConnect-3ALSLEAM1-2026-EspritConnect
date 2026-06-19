import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ToastHostComponent } from '../../shared/toast.component';
import { ThemeService } from '../../shared/theme.service';

interface NavItem { label: string; link: string; icon: string; exact?: boolean; }
interface NavGroup { label: string; items: NavItem[]; }

@Component({
  selector: 'ec-back-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastHostComponent],
  template: `
    <div class="min-h-screen bg-dark-bg text-ink-100 dark" [attr.data-admin-theme]="themeSvc.theme()">

      <!-- Mobile top bar -->
      <header class="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3
                     border-b border-white/10 bg-ink-900/85 backdrop-blur">
        <button (click)="sidebarOpen.set(!sidebarOpen())" aria-label="Toggle menu"
                class="w-9 h-9 rounded-lg hover:bg-white/5 flex items-center justify-center text-xl leading-none">☰</button>
        <span class="font-display font-bold tracking-tight">
          esprit<span class="text-primary">▸ connect</span>
        </span>
        <span class="text-[10px] font-mono text-primary border border-primary/40 rounded px-1.5 py-0.5">ADMIN</span>
      </header>

      <!-- Backdrop (mobile only) -->
      <div *ngIf="sidebarOpen()" (click)="sidebarOpen.set(false)"
           class="fixed inset-0 z-40 bg-black/50 md:hidden"></div>

      <!-- Sidebar -->
      <aside class="fixed z-50 inset-y-0 left-0 w-64 bg-ink-900 border-r border-white/10
                    flex flex-col transition-transform duration-200 ease-standard md:translate-x-0"
             [class.-translate-x-full]="!sidebarOpen()">
        <div class="h-16 px-5 flex items-center gap-2 border-b border-white/10 shrink-0">
          <span class="font-display text-lg font-bold tracking-tight">
            esprit<span class="text-primary">▸ connect</span>
          </span>
          <span class="text-[10px] font-mono text-primary border border-primary/40 rounded px-1.5 py-0.5">ADMIN</span>
        </div>

        <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div *ngFor="let g of groups">
            <p class="px-3 mb-1 text-[10px] font-mono uppercase tracking-wider text-ink-500">{{ g.label }}</p>
            <a *ngFor="let it of g.items" [routerLink]="it.link"
               [routerLinkActiveOptions]="it.exact ? { exact: true } : { exact: false }"
               routerLinkActive="!text-primary !bg-primary/10 !border-primary"
               (click)="sidebarOpen.set(false)"
               class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-2 border-transparent
                      text-ink-300 hover:text-ink-100 hover:bg-white/5 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0">
                <path [attr.d]="it.icon"></path>
              </svg>
              <span class="text-sm font-medium">{{ it.label }}</span>
            </a>
          </div>
        </nav>

        <!-- Account / footer -->
        <div class="border-t border-white/10 p-3 space-y-1.5 shrink-0">
          <label class="flex items-center justify-between gap-2 px-2 py-1 text-xs text-ink-400">
            <span>Theme</span>
            <select [value]="themeSvc.theme()" (change)="themeSvc.set($any($event.target).value)"
                    class="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs
                           text-ink-100 focus:border-primary outline-none cursor-pointer hover:bg-white/10 transition-colors">
              <option value="dark">🌙 Dark</option>
              <option value="light">☀ Light</option>
              <option value="slate">🌊 Slate</option>
            </select>
          </label>
          <a routerLink="/feed"
             class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-300
                    hover:text-ink-100 hover:bg-white/5 transition-colors">← Back to app</a>
          <button (click)="auth.logout()"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold
                         text-primary hover:bg-primary/10 transition-colors">Logout</button>
        </div>
      </aside>

      <!-- Content -->
      <div class="admin-content md:pl-64">
        <main class="p-6 max-w-[1400px] mx-auto">
          <router-outlet />
        </main>
      </div>

      <ec-toast-host />
    </div>
  `
})
export class BackOfficeLayoutComponent {
  protected auth = inject(AuthService);
  /** Shared theme selection — applied here via [data-admin-theme], also
   *  changeable from the home-page switcher. */
  protected themeSvc = inject(ThemeService);
  protected sidebarOpen = signal(false);

  protected groups: NavGroup[] = [
    { label: 'Main', items: [
      { label: 'Overview', link: '/admin', exact: true,
        icon: 'M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75' },
      { label: 'Stats', link: '/admin/stats',
        icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' }
    ]},
    { label: 'People', items: [
      { label: 'Users', link: '/admin/users',
        icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
      { label: 'Roles', link: '/admin/roles',
        icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z' },
      { label: 'Verifications', link: '/admin/verifications',
        icon: 'M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z' }
    ]},
    { label: 'Content', items: [
      { label: 'Moderation', link: '/admin/moderation',
        icon: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5' },
      { label: 'Jobs', link: '/admin/jobs',
        icon: 'M20.25 14.15v4.073a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V14.15M20.25 14.15A2.25 2.25 0 0021 12.073V8.625c0-1.243-1.007-2.25-2.25-2.25H5.25c-1.243 0-2.25 1.007-2.25 2.25v3.448a2.25 2.25 0 00.75 1.677M20.25 14.15a2.25 2.25 0 01-.75.388l-5.74 1.435a2.252 2.252 0 01-1.52 0L6.5 14.538a2.25 2.25 0 01-.75-.388m12-3.038V5.25a2.25 2.25 0 00-2.25-2.25h-4.5A2.25 2.25 0 007.5 5.25v6.862' }
    ]},
    { label: 'System', items: [
      { label: 'Audit log', link: '/admin/audit',
        icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
      { label: 'Communications', link: '/admin/communications',
        icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' }
    ]}
  ];
}
