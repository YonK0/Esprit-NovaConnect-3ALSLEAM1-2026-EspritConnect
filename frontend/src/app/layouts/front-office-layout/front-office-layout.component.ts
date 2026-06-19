import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatbotComponent } from '../../features/chatbot/chatbot.component';
import { ToastHostComponent } from '../../shared/toast.component';
import { NotificationsApi, NotificationItem } from '../../shared/notifications.service';
import { AvatarComponent } from '../../shared/avatar.component';
import { environment } from '../../../environments/environment';

interface NavItem { label: string; link: string; icon: string; }

@Component({
  selector: 'ec-front-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ChatbotComponent, ToastHostComponent, AvatarComponent],
  template: `
    <div class="min-h-screen" [class.bg-ink-100]="!isLanding()" [class.bg-dark-bg]="isLanding()">

      <!-- ░░ Sidebar (authenticated app only) ░░ -->
      <ng-container *ngIf="auth.isAuthenticated() && !isLanding()">
        <div *ngIf="mobileNavOpen()" (click)="mobileNavOpen.set(false)"
             class="fixed inset-0 z-40 bg-black/40 md:hidden"></div>

        <aside class="fixed z-50 inset-y-0 left-0 w-64 bg-white border-r border-ink-300/40
                      flex flex-col transition-transform duration-200 ease-standard md:translate-x-0"
               [class.-translate-x-full]="!mobileNavOpen()">
          <a routerLink="/feed" (click)="mobileNavOpen.set(false)"
             class="h-16 px-5 flex items-center gap-1 border-b border-ink-300/40 shrink-0
                    font-display text-lg font-bold">
            esprit<span class="text-primary">▸ connect</span>
          </a>

          <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            <a *ngFor="let it of nav" [routerLink]="it.link"
               routerLinkActive="!text-primary !bg-primary/10 !border-primary"
               (click)="mobileNavOpen.set(false)"
               class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-2 border-transparent
                      text-ink-700 hover:text-primary hover:bg-ink-100 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0">
                <path [attr.d]="it.icon"></path>
              </svg>
              <span class="text-sm font-medium">{{ it.label }}</span>
            </a>
          </nav>

          <div *ngIf="auth.hasRole('ADMIN')" class="border-t border-ink-300/40 p-3 shrink-0">
            <a routerLink="/admin" (click)="mobileNavOpen.set(false)"
               class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold
                      text-primary hover:bg-primary/10 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                   stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 shrink-0">
                <path d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"></path>
              </svg>
              Admin panel
            </a>
          </div>
        </aside>
      </ng-container>

      <!-- ░░ Content column ░░ -->
      <div [ngClass]="{ 'md:pl-64': auth.isAuthenticated() && !isLanding() }">

        <!-- Topbar (authenticated, non-landing): hamburger + notifications + avatar menu -->
        <header *ngIf="auth.isAuthenticated() && !isLanding()"
                class="sticky top-0 z-20 h-16 px-4 md:px-6 flex items-center gap-3
                       bg-ink-100/85 backdrop-blur border-b border-ink-300/30">
          <button (click)="mobileNavOpen.set(!mobileNavOpen())" aria-label="Menu"
                  class="md:hidden w-9 h-9 rounded-lg hover:bg-white flex items-center
                         justify-center text-ink-700 text-xl leading-none">☰</button>
          <a routerLink="/feed" class="md:hidden font-display font-bold">
            esprit<span class="text-primary">▸ connect</span>
          </a>

          <div class="ml-auto flex items-center gap-2">
            <!-- Notifications bell -->
            <div class="relative">
              <button (click)="toggleNotifDropdown()"
                      class="relative w-9 h-9 rounded-full hover:bg-white
                             flex items-center justify-center text-ink-700 hover:text-primary transition-colors">
                🔔
                <span *ngIf="unreadCount() > 0"
                      class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                             rounded-full bg-primary text-white text-[10px] font-mono
                             flex items-center justify-center leading-none">
                  {{ unreadCount() > 9 ? '9+' : unreadCount() }}
                </span>
              </button>

              <div *ngIf="notifOpen()"
                   class="absolute right-0 top-full mt-2 w-80 rounded-xl bg-white
                          border border-ink-300/40 shadow-xl z-50 overflow-hidden">
                <div class="px-4 py-2.5 border-b border-ink-300/30 flex justify-between items-center">
                  <p class="text-xs font-mono font-bold text-primary">▸ NOTIFICATIONS</p>
                  <div class="flex items-center gap-2">
                    <button *ngIf="unreadCount() > 0"
                            (click)="markAllRead(); $event.stopPropagation()"
                            class="text-xs text-primary hover:underline">Mark all read</button>
                    <button (click)="notifOpen.set(false)"
                            class="text-ink-400 hover:text-ink-700 text-lg leading-none">×</button>
                  </div>
                </div>
                <div *ngIf="notifs().length === 0" class="px-4 py-6 text-center text-sm text-ink-500">
                  All caught up ✓
                </div>
                <ul class="max-h-72 overflow-y-auto divide-y divide-ink-300/20">
                  <li *ngFor="let n of notifs()"
                      class="px-4 py-3 hover:bg-ink-50 cursor-pointer transition"
                      [class.bg-ink-50]="!n.read" (click)="openNotif(n)">
                    <p class="text-sm font-semibold" [class.text-primary]="!n.read">{{ n.title }}</p>
                    <p *ngIf="n.body" class="text-xs text-ink-500 truncate mt-0.5">{{ n.body }}</p>
                    <p class="text-[10px] text-ink-400 font-mono mt-1">{{ n.createdAt | date:'short' }}</p>
                  </li>
                </ul>
              </div>
            </div>

            <!-- Profile dropdown -->
            <div class="relative">
              <button (click)="toggleProfileDropdown()"
                      class="flex items-center gap-2 text-sm text-ink-700 hover:text-primary
                             px-2 py-1 rounded-lg hover:bg-white transition-colors">
                <ec-avatar [url]="meAvatar()" [name]="meName()" [size]="32"
                           [openToWork]="meOpenToWork()"></ec-avatar>
                <span class="hidden sm:inline max-w-[12rem] truncate">{{ meName() || auth.currentUser()?.email }}</span>
              </button>

              <div *ngIf="profileOpen()"
                   class="absolute right-0 top-full mt-2 w-48 rounded-lg bg-white
                          border border-ink-300/40 shadow-xl z-50 overflow-hidden">
                <a routerLink="/profile/me" (click)="profileOpen.set(false)"
                   class="flex items-center px-4 py-3 text-sm text-ink-700 hover:bg-ink-50 hover:text-primary transition">
                  👤 See profile
                </a>
                <a routerLink="/settings" (click)="profileOpen.set(false)"
                   class="flex items-center px-4 py-3 text-sm text-ink-700 hover:bg-ink-50 hover:text-primary transition border-t border-ink-300/20">
                  ⚙️ Settings
                </a>
                <button (click)="auth.logout(); profileOpen.set(false)"
                        class="w-full text-left px-4 py-3 text-sm text-ink-700 hover:bg-ink-50 hover:text-primary transition border-t border-ink-300/20">
                  🚪 Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- Slim header for logged-out, non-landing pages (login / signup / …) -->
        <header *ngIf="!auth.isAuthenticated() && !isLanding()"
                class="bg-white border-b border-ink-300/40">
          <div class="max-w-7xl mx-auto px-6 h-16 flex items-center">
            <a routerLink="/" class="font-display text-lg font-bold">
              esprit<span class="text-primary">▸ connect</span>
            </a>
            <div class="ml-auto flex items-center gap-2">
              <a routerLink="/login" class="btn-secondary btn-sm">Log in</a>
              <a routerLink="/signup" class="btn-primary btn-sm">Join</a>
            </div>
          </div>
        </header>

        <!-- Global identity-verification banner -->
        <div *ngIf="showVerifyBanner() && !isLanding()"
             class="bg-amber-50 border-b border-amber-300 text-amber-900">
          <div class="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
            <span class="text-lg">🪪</span>
            <p class="text-sm flex-1 min-w-[12rem]">
              <strong>Identity verification requested.</strong>
              An admin has asked you to verify your identity. It takes about a
              minute — upload an ID document and capture a short selfie.
            </p>
            <a routerLink="/signup/wizard" [queryParams]="{ resume: 'identity' }"
               class="btn-primary btn-sm whitespace-nowrap">Verify now →</a>
            <button (click)="dismissVerifyBanner()"
                    class="text-amber-700 hover:text-amber-900 text-xl leading-none px-1"
                    title="Dismiss">×</button>
          </div>
        </div>

        <main [ngClass]="isLanding() ? '' : 'max-w-7xl mx-auto px-6 py-8'">
          <router-outlet />
        </main>
      </div>

      <!-- ESPRIT assistant floating widget — logged-in only -->
      <ec-chatbot *ngIf="auth.isAuthenticated()" />
      <ec-toast-host />
    </div>
  `
})
export class FrontOfficeLayoutComponent implements OnInit, OnDestroy {
  protected auth = inject(AuthService);
  private notifApi = inject(NotificationsApi);
  private router = inject(Router);
  private http = inject(HttpClient);

  protected unreadCount = signal(0);
  protected notifOpen = signal(false);
  protected notifs = signal<NotificationItem[]>([]);
  protected profileOpen = signal(false);
  protected showVerifyBanner = signal(false);
  /** True on the public home route — the landing owns the whole viewport
   *  (its own dark nav + footer), so we hide the app shell + page padding. */
  protected isLanding = signal(false);
  // Current user's avatar/name/open-to-work for the header chip.
  protected meAvatar = signal<string | null>(null);
  protected meName = signal('');
  protected meOpenToWork = signal(false);
  protected mobileNavOpen = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private navSub: Subscription | null = null;

  /** Sidebar navigation (heroicons-style outline paths). */
  protected nav: NavItem[] = [
    { label: 'Feed', link: '/feed',
      icon: 'M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75' },
    { label: 'Directory', link: '/directory',
      icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
    { label: 'Network', link: '/network',
      icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m-9 9h18' },
    { label: 'Messages', link: '/messaging',
      icon: 'M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z' },
    { label: 'Mentorship', link: '/mentorship',
      icon: 'M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5' },
    { label: 'Jobs', link: '/jobs',
      icon: 'M20.25 14.15v4.073a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V14.15M20.25 14.15A2.25 2.25 0 0021 12.073V8.625c0-1.243-1.007-2.25-2.25-2.25H5.25c-1.243 0-2.25 1.007-2.25 2.25v3.448a2.25 2.25 0 00.75 1.677M20.25 14.15a2.25 2.25 0 01-.75.388l-5.74 1.435a2.252 2.252 0 01-1.52 0L6.5 14.538a2.25 2.25 0 01-.75-.388m12-3.038V5.25a2.25 2.25 0 00-2.25-2.25h-4.5A2.25 2.25 0 007.5 5.25v6.862' },
    { label: 'Events', link: '/events',
      icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
    { label: 'Groups', link: '/groups',
      icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z' },
    { label: 'Resources', link: '/resources',
      icon: 'M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z' }
  ];

  ngOnInit(): void {
    this.isLanding.set(this.isHomeRoute(this.router.url));
    if (this.auth.isAuthenticated()) {
      this.pollUnread();
      this.checkIdentityVerification();
      this.loadMe();
    }
    // The layout never re-mounts during SPA navigation, so re-check the
    // verification status on every route change.
    this.navSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        this.isLanding.set(this.isHomeRoute(this.router.url));
        this.mobileNavOpen.set(false);   // close the mobile drawer on navigation
        this.notifOpen.set(false);
        this.profileOpen.set(false);
        if (this.auth.isAuthenticated()) {
          this.checkIdentityVerification();
          if (!this.meName()) this.loadMe();
        } else {
          this.showVerifyBanner.set(false);
          this.meAvatar.set(null);
          this.meName.set('');
          this.meOpenToWork.set(false);
        }
      });
  }

  /** The public home page ('/' possibly with query/hash) — not '/feed' etc. */
  private isHomeRoute(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return path === '/' || path === '';
  }

  /** Load the current user's profile so the header shows their photo. */
  private loadMe(): void {
    this.http.get<{ avatarUrl?: string; firstName?: string; lastName?: string; openToWork?: boolean }>(
      `${environment.apiUrl}/profiles/me`
    ).subscribe({
      next: (p) => {
        this.meAvatar.set(p?.avatarUrl ?? null);
        this.meOpenToWork.set(!!p?.openToWork);
        const name = `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim();
        this.meName.set(name || (this.auth.currentUser()?.email ?? ''));
      },
      error: () => {}
    });
  }

  private checkIdentityVerification(): void {
    if (sessionStorage.getItem('ec_verify_banner_dismissed') === '1') return;
    this.http.get<{ identityVerified?: boolean; identityVerificationRequestedAt?: string | null }>(
      `${environment.apiUrl}/users/me`
    ).subscribe({
      next: (u) => {
        this.showVerifyBanner.set(
          !u?.identityVerified && !!u?.identityVerificationRequestedAt);
      },
      error: () => {},
    });
  }

  dismissVerifyBanner(): void {
    this.showVerifyBanner.set(false);
    sessionStorage.setItem('ec_verify_banner_dismissed', '1');
  }

  ngOnDestroy(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.navSub?.unsubscribe();
  }

  private pollUnread(): void {
    this.notifApi.unreadCount().subscribe({ next: n => this.unreadCount.set(n), error: () => {} });
    this.pollTimer = setInterval(() => {
      if (this.auth.isAuthenticated()) {
        this.notifApi.unreadCount().subscribe({ next: n => this.unreadCount.set(n), error: () => {} });
      }
    }, 30_000);
  }

  toggleNotifDropdown(): void {
    const next = !this.notifOpen();
    this.notifOpen.set(next);
    this.profileOpen.set(false);
    if (next && this.notifs().length === 0) {
      this.notifApi.list(0, 15).subscribe({
        next: (page) => this.notifs.set(page.content ?? []),
        error: () => {}
      });
    }
  }

  toggleProfileDropdown(): void {
    this.profileOpen.set(!this.profileOpen());
    this.notifOpen.set(false);
  }

  markAllRead(): void {
    this.notifApi.markAllRead().subscribe({
      next: () => {
        this.notifs.update(all => all.map(n => ({ ...n, read: true })));
        this.unreadCount.set(0);
      },
      error: () => {}
    });
  }

  openNotif(n: NotificationItem): void {
    if (!n.read) {
      this.notifApi.markRead(n.id).subscribe({
        next: () => {
          this.notifs.update(all => all.map(x => x.id === n.id ? { ...x, read: true } : x));
          this.unreadCount.update(c => Math.max(0, c - 1));
        },
        error: () => {}
      });
    }
    this.notifOpen.set(false);
    if (n.link) {
      this.router.navigateByUrl(n.link).catch(() => {});
    }
  }

  initials(): string {
    const email = this.auth.currentUser()?.email ?? '';
    return email.slice(0, 2).toUpperCase();
  }
}
