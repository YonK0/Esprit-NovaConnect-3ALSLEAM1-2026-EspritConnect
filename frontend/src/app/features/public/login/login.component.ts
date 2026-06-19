import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'ec-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="grid md:grid-cols-2 gap-10 items-stretch min-h-[600px]">
      <div class="card flex flex-col justify-center">
        <p class="text-xs font-mono text-primary mb-3">▸ WELCOME BACK</p>
        <h1 class="font-display text-4xl font-bold mb-2">Log in to your<br/>network.</h1>
        <p class="text-ink-600 mb-6">Reconnect with the alumni community.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="label">Email</label>
            <input type="email" class="field" formControlName="email"
                   placeholder="you@esprit.tn" />
            <p *ngIf="form.controls.email.touched && form.controls.email.invalid"
               class="text-xs text-primary mt-1">Valid email required.</p>
          </div>
          <div>
            <label class="label">Password</label>
            <input type="password" class="field" formControlName="password" />
            <a routerLink="/forgot-password" class="text-xs text-primary hover:underline mt-1 inline-block">
              Forgot password?
            </a>
          </div>

          <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3 space-y-2">
            <p class="text-sm text-primary">{{ error() }}</p>
            <!-- Special-case: backend signals EMAIL_NOT_VERIFIED so we can
                 show the resend-verification CTA inline. -->
            <button *ngIf="needsEmailVerification()" type="button"
                    class="text-xs text-primary font-semibold hover:underline"
                    (click)="resendVerification()"
                    [disabled]="resending()">
              {{ resending() ? 'Sending…' : (resentOk() ? '✓ Sent — check your inbox' : '↻ Resend verification email') }}
            </button>
          </div>

          <button type="submit" class="btn-primary w-full"
                  [disabled]="form.invalid || loading()">
            {{ loading() ? '…' : 'Log in →' }}
          </button>

          <p class="text-sm text-ink-600 mt-2">
            New grad? <a routerLink="/signup" class="text-primary font-semibold">Create an account →</a>
          </p>
        </form>
      </div>

      <div class="rounded-2xl bg-ink-900 text-white p-10 relative overflow-hidden">
        <div class="absolute inset-0 opacity-30"
             style="background-image:radial-gradient(circle at 70% 40%, #FF2D3D 0%, transparent 60%)"></div>
        <div class="relative">
          <h2 class="font-display text-3xl font-bold mb-2">Every connection is<br/>an opportunity.</h2>
          <p class="text-ink-300">1,248 active mentors · 3,412 open jobs · 89 countries</p>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected needsEmailVerification = signal(false);
  protected resending = signal(false);
  protected resentOk = signal(false);

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.needsEmailVerification.set(false);
    this.resentOk.set(false);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => { this.loading.set(false); this.router.navigateByUrl('/feed'); },
      error: (err) => {
        this.loading.set(false);
        const msg: string = err?.error?.message ?? 'Login failed';
        // Backend prefixes the message with EMAIL_NOT_VERIFIED: when the
        // account is otherwise valid but the user hasn't clicked the link.
        if (msg.startsWith('EMAIL_NOT_VERIFIED:')) {
          this.error.set(msg.substring('EMAIL_NOT_VERIFIED:'.length).trim());
          this.needsEmailVerification.set(true);
        } else {
          this.error.set(msg);
        }
      }
    });
  }

  resendVerification(): void {
    const email = this.form.controls.email.value;
    if (!email) return;
    this.resending.set(true);
    this.resentOk.set(false);
    this.auth.resendVerification(email).subscribe({
      next: () => { this.resending.set(false); this.resentOk.set(true); },
      // Errors are swallowed on purpose — don't leak "email exists" signal.
      error: () => { this.resending.set(false); this.resentOk.set(true); },
    });
  }
}
