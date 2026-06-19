import { Injectable, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light' | 'slate';

/**
 * Holds the selected admin-panel theme, shared between the admin header and
 * the home-page switcher so they stay in sync. The theme is applied (via
 * [data-admin-theme]) only inside the back-office layout — the public pages
 * keep their own light design — but it can be *changed* from either place.
 * Persisted per browser.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'ec_admin_theme';

  /** Current admin theme. Defaults to light when nothing is saved. */
  readonly theme = signal<AppTheme>(this.read());

  private read(): AppTheme {
    const t = localStorage.getItem(this.KEY);
    return t === 'dark' || t === 'slate' ? t : 'light';
  }

  set(t: AppTheme): void {
    this.theme.set(t);
    try { localStorage.setItem(this.KEY, t); } catch { /* private mode: just lose persistence */ }
  }
}
