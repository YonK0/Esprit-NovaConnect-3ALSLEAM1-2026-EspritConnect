import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shared circular avatar used everywhere (header, feed, directory, job
 * candidates, mentorship, profiles). Renders the photo when set, otherwise
 * deterministic initials. When the person is open to work it shows the
 * LinkedIn-style green ring + "OPEN TO WORK" banner (banner hidden on small
 * sizes where it wouldn't fit — the green ring still shows).
 */
@Component({
  selector: 'ec-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="ava" [style.width.px]="size" [style.height.px]="size"
          [class.otw]="openToWork"
          [title]="openToWork ? (name + ' · Open to work') : name">
      <span class="disc" [style.background]="(url && !failed) ? '#0b0b0d' : bg">
        <img *ngIf="url && !failed" [src]="url" alt="" loading="lazy" (error)="failed = true" />
        <span *ngIf="!url || failed" class="ini" [style.font-size.px]="size * 0.38">{{ initials }}</span>
      </span>
      <span *ngIf="showBanner" class="banner" [style.font-size.px]="bannerFont">OPEN TO WORK</span>
    </span>
  `,
  styles: [`
    .ava { position:relative; display:inline-flex; flex-shrink:0; vertical-align:middle; }
    .disc { width:100%; height:100%; border-radius:50%; overflow:hidden; display:flex;
            align-items:center; justify-content:center; color:#fff;
            font-family:"JetBrains Mono", ui-monospace, monospace; font-weight:600;
            box-shadow: 0 0 0 2px rgba(227,6,19,.30); }
    .ava.otw .disc { box-shadow: 0 0 0 2px #047857; }   /* LinkedIn-style green ring */
    .disc img { width:100%; height:100%; object-fit:cover; display:block; }
    .banner { position:absolute; bottom:-4px; left:50%; transform:translateX(-50%);
              background:#047857; color:#fff; font-weight:700; letter-spacing:.02em;
              line-height:1; padding:1px 6px; border-radius:999px; white-space:nowrap;
              border:1.5px solid #fff; }
  `]
})
export class AvatarComponent implements OnChanges {
  @Input() url: string | null | undefined;
  @Input() name = '';
  @Input() size = 48;
  @Input() openToWork = false;

  /** Set when the photo fails to load — falls back to initials instead of a
   *  broken/black tile. Reset when the url input changes (reused in *ngFor). */
  protected failed = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['url']) this.failed = false;
  }

  // Banner only on large (profile-page) avatars; smaller avatars (directory,
  // header, candidates, network) show just the green ring so the banner can't
  // overlap the tags row beneath the card.
  get showBanner(): boolean { return this.openToWork && this.size >= 96; }

  get initials(): string {
    const parts = (this.name || '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  get bannerFont(): number { return Math.max(8, Math.round(this.size * 0.11)); }

  get bg(): string {
    const palette = ['#9F5468', '#7A5A8E', '#3C8A87', '#86773C', '#6B5B95', '#A0522D', '#5F8B7D', '#4A6FA5'];
    let h = 0;
    for (const c of (this.name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }
}
