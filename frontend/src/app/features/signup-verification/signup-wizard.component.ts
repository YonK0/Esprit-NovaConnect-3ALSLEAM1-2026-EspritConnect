import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SignupFlowService } from './services/signup-flow.service';
import { ToastService } from '../../shared/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { StepsStepperComponent } from './components/steps-stepper.component';
import { RolePickerComponent } from './components/role-picker.component';
import { BasicInfoFormComponent } from './components/basic-info-form.component';
import { DocumentUploadComponent } from './components/document-upload.component';
import { FaceCaptureComponent } from './components/face-capture.component';
import { VerificationResultComponent } from './components/verification-result.component';
import { BasicInfo, Role } from './models/signup-state.model';

/**
 * Five-step identity verification flow:
 *   role → basic info → upload documents → live face capture → result
 *
 * Children stay dumb (Inputs / Outputs only). The wizard owns:
 *  - the active step (via SignupFlowService — also persists to sessionStorage
 *    so an accidental refresh after uploading a passport doesn't lose work);
 *  - the network calls to /auth/signup/init, /signup/verify-documents and
 *    /signup/verify-face;
 *  - forwarding loading / error state into the active child via @ViewChild
 *    refs so spinners + inline errors land next to the triggering action.
 */
@Component({
  selector: 'ec-signup-wizard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    StepsStepperComponent,
    RolePickerComponent,
    BasicInfoFormComponent,
    DocumentUploadComponent,
    FaceCaptureComponent,
    VerificationResultComponent,
  ],
  template: `
    <div class="max-w-3xl mx-auto py-8">
      <div class="flex justify-between items-end mb-6">
        <div>
          <p class="text-xs font-mono text-primary mb-2">
            {{ resumeIdentity() ? '▸ ADMIN REQUEST' : '▸ JOIN THE NETWORK' }}
          </p>
          <h1 class="font-display text-3xl font-bold">
            {{ resumeIdentity() ? 'Verify your identity' : 'Create your account' }}
          </h1>
        </div>
        <a *ngIf="!resumeIdentity()"
           routerLink="/login" class="text-sm text-ink-600 hover:text-primary">
          Already have one? Log in
        </a>
        <a *ngIf="resumeIdentity()"
           routerLink="/profile/me" class="text-sm text-ink-600 hover:text-primary">
          ← Back to profile
        </a>
      </div>

      <ec-steps-stepper [currentStep]="flow.step()"></ec-steps-stepper>

      <div class="card">
        <ng-container [ngSwitch]="flow.step()">

          <ec-role-picker *ngSwitchCase="'role'"
            (roleSelected)="onRole($event)"></ec-role-picker>

          <ec-basic-info-form *ngSwitchCase="'basic'"
            #basic
            [role]="flow.role()!"
            (back)="flow.goToStep('role')"
            (submitted)="onBasicSubmitted($event)"></ec-basic-info-form>

          <ec-document-upload *ngSwitchCase="'documents'"
            #docs
            [role]="flow.role()!"
            [showSkip]="!resumeIdentity()"
            [showBack]="!resumeIdentity()"
            (back)="flow.goToStep('basic')"
            (skip)="onSkipIdentity()"
            (submitted)="onDocsSubmitted($event)"></ec-document-upload>

          <ec-face-capture *ngSwitchCase="'face'"
            #face
            [showSkip]="!resumeIdentity()"
            [showBack]="!resumeIdentity()"
            (back)="flow.goToStep('documents')"
            (skip)="onSkipIdentity()"
            (submitted)="onFramesSubmitted($event)"></ec-face-capture>

          <ec-verification-result *ngSwitchCase="'result'"
            [result]="flow.state().result"
            [skipped]="flow.state().skipped"
            [resumeIdentity]="resumeIdentity()"
            (reset)="onReset()"></ec-verification-result>

        </ng-container>
      </div>
    </div>
  `,
})
export class SignupWizardComponent implements OnInit {
  protected flow = inject(SignupFlowService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  @ViewChild('basic') private basic?: BasicInfoFormComponent;
  @ViewChild('docs')  private docs?: DocumentUploadComponent;
  @ViewChild('face')  private face?: FaceCaptureComponent;

  /**
   * True when the wizard was opened via the admin-requested verification
   * flow ({@code ?resume=identity}). The header copy, the "log in" link
   * in the corner, and the Skip buttons all swap to a logged-in tone
   * when this is set — the user isn't creating a new account, they're
   * responding to a verification request, so "Skip" doesn't apply.
   */
  protected resumeIdentity = signal(false);

  /** When the simple signup page redirects here with role+identity fields in
   *  the query string (because the user picked ALUMNI / MENTOR / RECRUITER),
   *  short-circuit straight to the basic-info step with the values pre-filled.
   *
   *  When the profile page sends an already-logged-in user back here with
   *  {@code ?resume=identity} (admin asked for identity verification), seed
   *  the wizard with the current user's id (= verification session id) and
   *  jump straight to the documents step. */
  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;

    if (q.get('resume') === 'identity') {
      const u = this.auth.currentUser();
      if (!u) {
        // Edge case: guard let them in but we lost the session somehow.
        this.toast.error('Please log in again to resume verification.');
        return;
      }
      this.resumeIdentity.set(true);
      this.flow.seedFromEmailVerify(u.userId, u.role as Role);
      return;
    }

    const role = q.get('role') as Role | null;
    if (role && ['STUDENT','ALUMNI','MENTOR','RECRUITER'].includes(role)) {
      this.flow.setRole(role);
      // Prefill once the BasicInfoFormComponent mounts (next tick).
      setTimeout(() => this.basic?.patchValues({
        firstName: q.get('firstName') ?? undefined,
        lastName:  q.get('lastName')  ?? undefined,
        email:     q.get('email')     ?? undefined,
        promotionYear: q.get('promotionYear')
          ? Number(q.get('promotionYear')) : undefined,
        specialtyCode: q.get('specialtyCode') ?? undefined,
      }));
    }
  }

  onRole(role: Role): void {
    this.flow.setRole(role);
  }

  onBasicSubmitted(info: BasicInfo): void {
    this.basic?.setLoading(true);
    this.basic?.setError(null);
    this.flow.init(info).subscribe({
      next: (resp) => {
        this.basic?.setLoading(false);
        if (resp.verificationSkipped) {
          this.toast.success('Account created — pending admin approval.');
        }
      },
      error: (err) => {
        this.basic?.setLoading(false);
        const msg = err?.error?.message ?? 'Could not start signup.';
        this.basic?.setError(msg);
        this.toast.error(msg);
      },
    });
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
          this.toast.success(this.resumeIdentity()
            ? 'Identity verified — your profile now shows the verified badge.'
            : 'Verification passed — pending admin approval.');
        } else {
          // Unlimited retries — never a hard fail. Show the reason and let
          // the user adjust and try again.
          const reason = result.reasons?.join('; ') || 'Face not matched.';
          this.face?.setError(`${reason} — adjust your lighting/position and try again.`);
          this.toast.error('Face not matched — please try again.');
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

  /** Opt out of identity verification at signup. Calls the backend to
   *  move the user to PENDING_APPROVAL (so they appear in the admin
   *  queue), then hops to the result screen with skipped=true. */
  onSkipIdentity(): void {
    this.flow.skipIdentity().subscribe({
      next: () => this.toast.info('Identity check skipped. An admin will review your account.'),
      error: err => this.toast.error(err?.error?.message ?? 'Could not skip verification.'),
    });
  }

  onReset(): void {
    this.flow.reset();
  }
}
