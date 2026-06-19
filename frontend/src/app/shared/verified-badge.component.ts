import { Component, Input } from '@angular/core';

/**
 * Twitter/Facebook-style blue verified checkmark. Rendered next to a
 * user's name wherever we know they've completed identity verification
 * (Profile.identityVerified). Inline SVG keeps it dependency-free and
 * avoids HTML sanitization issues that arise with [innerHTML].
 */
@Component({
  selector: 'ec-verified-badge',
  standalone: true,
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size" [attr.height]="size"
         class="inline-block align-text-bottom shrink-0"
         role="img" aria-label="Verified identity">
      <title>Verified identity</title>
      <path fill="#1d9bf0" d="M22.25 12l-2.4-2.75.33-3.64-3.56-.81L14.75 1.6
                              12 2.79 9.25 1.6 7.33 4.8l-3.56.8.33 3.65L1.7 12
                              l2.4 2.75-.33 3.64 3.56.81L9.25 22.4 12 21.2
                              l2.75 1.19 1.92-3.2 3.56-.81-.33-3.64z"/>
      <path fill="#fff" d="M10.6 14.6l-2.2-2.2-1.1 1.1 3.3 3.3 6-6-1.1-1.1z"/>
    </svg>
  `,
})
export class VerifiedBadgeComponent {
  /** Pixel size of the badge (square). */
  @Input() size = 16;
}
