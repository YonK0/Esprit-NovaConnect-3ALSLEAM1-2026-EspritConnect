import { Component, ViewChild, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/toast.service';
import { environment } from '../../../../environments/environment';

import { SignupFlowService } from '../../signup-verification/services/signup-flow.service';
import { StepsStepperComponent } from '../../signup-verification/components/steps-stepper.component';
import { DocumentUploadComponent } from '../../signup-verification/components/document-upload.component';
import { FaceCaptureComponent } from '../../signup-verification/components/face-capture.component';
import { VerificationResultComponent } from '../../signup-verification/components/verification-result.component';
import { Role } from '../../signup-verification/models/signup-state.model';

interface VerifyEmailResponse {
  sessionId: string;
  status: string;
  requiresVerification: boolean;
}

/**
 * OTP-style email verification AND continuation into the document/face
 * identity-verification steps.
 *
 * Stages this single screen drives:
 *
 *  1. **OTP**: user enters the 6-digit code emailed at signup.
 *  2. On success the backend returns the verification sessionId. If KYC
 *     is enabled we seed `SignupFlowService` and immediately render the
 *     existing `<ec-document-upload>` step.
 *  3. **Documents**: ID + (for ALUMNI/MENTOR/RECRUITER) a secondary doc.
 *     Calls the `/auth/signup/verify-documents` endpoint via the flow
 *     service.
 *  4. **Face**: 3-frame webcam capture, verified against the ID portrait.
 *  5. **Result**: PASS → awaiting admin approval; FAIL → retry or contact
 *     support.
 *
 *  When KYC is disabled (dev installs without the Python verification
 *  service running) we stop at stage 2 and show "awaiting admin approval"
 *  with a link back to /login — matching the previous behaviour.
 */
@Component({
  selector: 'ec-verify-email',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    StepsStepperComponent,
    DocumentUploadComponent,
    FaceCaptureComponent,
    VerificationResultComponent,
  ],
  template: `
    <div class="max-w-3xl mx-auto card mt-12">
      <p class="text-xs font-mono text-primary mb-3">▸ IDENTITY VERIFICATION</p>

      <!-- Stage 1: OTP entry — initial state -->
      <ng-container *ngIf="state() === 'idle'">
        <h1 class="font-display text-2xl font-bold mb-3">Enter your verification code</h1>
        <p class="text-ink-600 text-sm mb-5">
          We just sent a 6-digit code to
          <strong class="text-ink-900">{{ email() || 'your email' }}</strong>.
          Paste it below to confirm your address. After that we'll verify your
          identity with your ID and a quick selfie. The code expires in 24 hours.
        </p>

        <label class="label">Email</label>
        <input class="field mb-4" type="email" [(ngModel)]="emailInput"
               placeholder="you@example.com"
               [disabled]="!!email()" />

        <label class="label">6-digit code</label>
        <input class="field font-mono tracking-[0.5em] text-center text-xl"
               type="text" inputmode="numeric" maxlength="6"
               [(ngModel)]="codeInput"
               (ngModelChange)="onCodeChange($event)"
               placeholder="••••••" />

        <p *ngIf="errorMessage()" class="text-xs text-primary mt-3">{{ errorMessage() }}</p>

        <button class="btn-primary w-full mt-5"
                (click)="submit()"
                [disabled]="!canSubmit() || submitting()">
          {{ submitting() ? '…' : 'Verify email →' }}
        </button>

        <div class="mt-5 pt-5 border-t border-ink-200">
          <p class="text-xs text-ink-500 mb-2">Didn't receive it? Check your spam folder.</p>
          <button class="text-sm text-primary font-semibold hover:underline"
                  (click)="resend()"
                  [disabled]="!emailForResend() || resending()">
            {{ resending() ? 'Sending…' : 'Resend code' }}
          </button>
          <p *ngIf="resendOk()" class="text-xs text-green-700 mt-2">
            ✓ A new code has been sent.
          </p>
        </div>
      </ng-container>

      <!-- Stage 2 fallback: KYC disabled on this install — show the legacy
           "awaiting admin approval" success state. -->
      <ng-container *ngIf="state() === 'no-kyc-success'">
        <h1 class="font-display text-2xl font-bold mb-3 text-green-700">
          ✓ Email verified
        </h1>
        <p class="text-ink-600 text-sm mb-3">
          Your email address is confirmed. An admin will now review your account
          and approve it shortly — you'll get a second email when you can log in.
        </p>
        <p class="text-xs text-ink-500 mb-6">
          Status: <span class="font-mono">PENDING_APPROVAL</span>
        </p>
        <a routerLink="/login" class="btn-primary w-full inline-block text-center">
          Back to login
        </a>
      </ng-container>

      <!-- Stages 3-5: documents / face / result, driven by SignupFlowService. -->
      <ng-container *ngIf="state() === 'kyc'">
        <h1 class="font-display text-2xl font-bold mb-1">Identity verification</h1>
        <p class="text-ink-600 text-sm mb-5">
          Two short steps: upload your ID, then a quick 3-frame selfie capture.
        </p>

        <ec-steps-stepper [currentStep]="flow.step()"></ec-steps-stepper>

        <ng-container [ngSwitch]="flow.step()">
          <ec-document-upload *ngSwitchCase="'documents'"
            #docs
            [role]="flow.role()!"
            (back)="cancelKyc()"
            (skip)="onSkipIdentity()"
            (submitted)="onDocsSubmitted($event)"></ec-document-upload>

          <ec-face-capture *ngSwitchCase="'face'"
            #face
            (back)="flow.goToStep('documents')"
            (skip)="onSkipIdentity()"
            (submitted)="onFramesSubmitted($event)"></ec-face-capture>

          <ec-verification-result *ngSwitchCase="'result'"
            [result]="flow.state().result"
            [skipped]="flow.state().skipped"
            (reset)="onReset()"></ec-verification-result>
        </ng-container>
      </ng-container>
    </div>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);
  protected flow = inject(SignupFlowService);

  @ViewChild('docs') private docs?: DocumentUploadComponent;
  @ViewChild('face') private face?: FaceCaptureComponent;

  protected state = signal<'idle' | 'no-kyc-success' | 'kyc'>('idle');
  protected email = signal<string>('');
  protected emailInput = '';
  protected codeInput = '';
  protected submitting = signal(false);
  protected resending = signal(false);
  protected resendOk = signal(false);
  protected errorMessage = signal<string>('');

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const e = q.get('email') ?? '';
    if (e) {
      this.email.set(e);
      this.emailInput = e;
    }
    // Pre-capture role + identity from the signup query params so that
    // when the OTP succeeds, the document-upload step requires the right
    // secondary doc (degree for ALUMNI/MENTOR, corporate proof for RECRUITER).
    const r = q.get('role');
    if (r === 'STUDENT' || r === 'ALUMNI' || r === 'MENTOR' || r === 'RECRUITER') {
      this.passedRole = r;
    }
    // Wizard state could be left over from a previous session — clear it
    // before we (potentially) seed a fresh one after OTP success.
    this.flow.reset();
  }

  /** Role carried via signup query params — null when the user came
   *  here without going through /signup first (e.g. from a stale email link). */
  private passedRole: Role | null = null;

  /** Strip anything that isn't a digit and clamp to 6 chars. */
  onCodeChange(v: string): void {
    const digits = (v ?? '').replace(/\D+/g, '').slice(0, 6);
    if (digits !== v) this.codeInput = digits;
    if (this.errorMessage()) this.errorMessage.set('');
  }

  canSubmit(): boolean {
    return this.emailForResend().length > 0 && this.codeInput.length === 6;
  }

  emailForResend(): string {
    return (this.email() || this.emailInput || '').trim();
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    // We bypass AuthService here because the response shape changed —
    // see VerifyEmailResponse on the backend.
    this.http.post<VerifyEmailResponse>(
      `${environment.apiUrl}/auth/verify-email`,
      { email: this.emailForResend(), code: this.codeInput },
    ).subscribe({
      next: (resp) => {
        this.submitting.set(false);
        if (resp.requiresVerification) {
          // Seed the flow service with the verification session id, then
          // render the document upload step inline.
          this.flow.seedFromEmailVerify(resp.sessionId, this.guessRole());
          this.state.set('kyc');
        } else {
          // KYC disabled on this install — fall back to the legacy success
          // screen ("email verified, awaiting admin approval").
          this.state.set('no-kyc-success');
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Invalid or expired code.');
      }
    });
  }

  resend(): void {
    const e = this.emailForResend();
    if (!e) return;
    this.resending.set(true);
    this.resendOk.set(false);
    this.auth.resendVerification(e).subscribe({
      next: () => {
        this.resending.set(false);
        this.resendOk.set(true);
      },
      error: () => {
        this.resending.set(false);
        // Same UX as success — avoid leaking whether the email is registered.
        this.resendOk.set(true);
      }
    });
  }

  /**
   * Use the role passed via query params from /signup. Falls back to
   * STUDENT (the most permissive — only requires the ID) when we don't
   * have one. The DocumentUploadComponent reads this to decide whether
   * to show the secondary-doc drop-zone (degree for ALUMNI/MENTOR,
   * corporate proof for RECRUITER).
   */
  private guessRole(): Role {
    return this.passedRole ?? 'STUDENT';
  }

  cancelKyc(): void {
    // Leaving the verification mid-flow returns the user to the login
    // page; the backend keeps their DRAFT status so they can resume by
    // logging in (which will be rejected with EMAIL_NOT_VERIFIED's sibling
    // BUT we leave that for the user to discover). Cleanest is to point
    // them back to login.
    this.flow.reset();
    window.location.href = '/login';
  }

  onDocsSubmitted(payload: { idFile: File; secondaryFile: File | null }): void {
    this.docs?.setLoading(true);
    this.docs?.setError(null);
    this.flow.verifyDocuments(payload.idFile, payload.secondaryFile).subscribe({
      next: () => {
        this.docs?.setLoading(false);
        this.toast.success('Documents verified.');
      },
      error: (err) => {
        this.docs?.setLoading(false);
        const msg = err?.error?.message ?? 'Document verification failed.';
        this.docs?.setError(msg);
        this.toast.error(msg);
      },
    });
  }

  onFramesSubmitted(frames: [File, File, File]): void {
    this.face?.setSubmitting(true);
    this.face?.setError(null);
    this.flow.verifyFace(frames).subscribe({
      next: (result) => {
        this.face?.setSubmitting(false);
        if (result.verdict === 'PASS') {
          this.toast.success('Verification passed — pending admin approval.');
        } else if (result.verdict === 'RETRYABLE') {
          this.face?.setError(
            `${result.reasons.join('; ')} (${result.attemptsRemaining} attempts left)`
          );
          this.toast.error('Face match failed — please try again.');
        } else {
          this.toast.error('Verification could not be completed.');
        }
      },
      error: (err) => {
        this.face?.setSubmitting(false);
        const msg = err?.error?.message ?? 'Verification failed.';
        this.face?.setError(msg);
        this.toast.error(msg);
      },
    });
  }

  onReset(): void {
    this.flow.reset();
    this.state.set('idle');
  }

  /** "Skip for now" on the documents / face steps. Calls the backend
   *  to move the user from DRAFT to PENDING_APPROVAL (so the admin queue
   *  sees them) and then lets the SignupFlowService navigate the wizard
   *  to the result screen with skipped=true. */
  onSkipIdentity(): void {
    this.flow.skipIdentity().subscribe({
      next: () => this.toast.success(
        'Identity check skipped. An admin will review your account.'),
      error: (err) => this.toast.error(
        err?.error?.message ?? 'Could not skip verification.'),
    });
  }
}
