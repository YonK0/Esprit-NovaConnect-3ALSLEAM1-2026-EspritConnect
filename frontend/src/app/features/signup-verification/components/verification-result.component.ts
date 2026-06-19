import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FaceVerifyResult } from '../models/signup-state.model';

@Component({
  selector: 'ec-verification-result',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <ng-container [ngSwitch]="display">
      <!-- Admin-requested (or voluntary) identity re-verification by an
           already-active member. They're not awaiting registration approval —
           their identity is now verified and the badge is live. -->
      <div *ngSwitchCase="'verified'" class="text-center py-10">
        <p class="text-5xl mb-4">✅</p>
        <h2 class="font-display text-2xl font-bold mb-2">Identity verified</h2>
        <p class="text-ink-600 max-w-md mx-auto mb-6">
          Thanks! Your identity has been verified — the blue verified badge now
          appears on your profile. No further action is needed.
        </p>
        <a routerLink="/profile/me" class="btn-primary inline-block">Go to my profile →</a>
      </div>

      <!-- Identity verification skipped (manual "skip for now" OR esprit.tn
           auto-skip). In both cases the account now exists and is waiting in
           the admin approval queue. -->
      <div *ngSwitchCase="'skipped'" class="text-center py-10">
        <p class="text-5xl mb-4">✅</p>
        <h2 class="font-display text-2xl font-bold mb-2">Account created 🎉</h2>
        <p class="text-ink-600 max-w-md mx-auto mb-6">
          Your account has been created and is now awaiting verification by an admin.
          You'll receive an email once it's been reviewed and you can log in.
        </p>
        <a routerLink="/login" class="btn-primary inline-block">Go to login →</a>
      </div>

      <!-- Verification passed -->
      <div *ngSwitchCase="'pass'" class="text-center py-10">
        <p class="text-5xl mb-4">✅</p>
        <h2 class="font-display text-2xl font-bold mb-2">Verification complete.</h2>
        <p class="text-ink-600 max-w-md mx-auto mb-6">
          Your registration is submitted for admin approval. You'll receive an email
          within 48 hours.
        </p>
        <a routerLink="/login" class="btn-primary inline-block">Go to login →</a>
      </div>

      <!-- Final failure (retries exhausted) -->
      <div *ngSwitchCase="'fail'" class="text-center py-10">
        <p class="text-5xl mb-4">❌</p>
        <h2 class="font-display text-2xl font-bold mb-2">Verification could not be completed.</h2>
        <ul *ngIf="result?.reasons?.length" class="text-ink-600 text-sm max-w-md mx-auto mb-6">
          <li *ngFor="let r of result?.reasons">{{ r }}</li>
        </ul>
        <p class="text-ink-600 max-w-md mx-auto mb-6 text-sm">
          Please contact <a href="mailto:support@espritconnect.tn" class="text-primary">support&#64;espritconnect.tn</a>.
        </p>
        <button class="btn-secondary" (click)="reset.emit()">↺ Start over</button>
      </div>
    </ng-container>
  `,
})
export class VerificationResultComponent {
  @Input() result: FaceVerifyResult | null = null;
  /** True when init said the verification was skipped (esprit.tn student). */
  @Input() skipped = false;
  /** True when this is an admin-requested re-verification of an already-active
   *  member (entered via ?resume=identity) — changes the success copy. */
  @Input() resumeIdentity = false;

  @Output() reset = new EventEmitter<void>();

  protected get display(): 'skipped' | 'pass' | 'fail' | 'verified' {
    if (this.resumeIdentity && this.result?.verdict === 'PASS') return 'verified';
    if (this.skipped) return 'skipped';
    if (this.result?.verdict === 'PASS') return 'pass';
    return 'fail';
  }
}
