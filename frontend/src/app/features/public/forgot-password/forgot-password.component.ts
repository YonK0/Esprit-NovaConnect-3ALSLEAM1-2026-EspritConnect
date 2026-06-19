import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'ec-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="grid md:grid-cols-2 gap-10 items-stretch min-h-[600px]">
      <div class="card flex flex-col justify-center">
        <p class="text-xs font-mono text-primary mb-3">▸ PASSWORD RECOVERY</p>
        <h1 class="font-display text-4xl font-bold mb-2">Reset your<br/>password.</h1>
        <p class="text-ink-600 mb-6">Enter your email and we'll send you a reset link.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="label">Email</label>
            <input type="email" class="field" formControlName="email"
                   placeholder="you@esprit.tn" />
            <p *ngIf="form.controls.email.touched && form.controls.email.invalid"
               class="text-xs text-primary mt-1">Valid email required.</p>
          </div>

          <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
            <p class="text-sm text-primary">{{ error() }}</p>
          </div>

          <div *ngIf="success()" class="rounded-lg bg-green-900/30 border border-green-500/50 p-3">
            <p class="text-sm text-green-300">✓ {{ success() }}</p>
          </div>

          <button type="submit" class="btn-primary w-full"
                  [disabled]="form.invalid || loading()">
            {{ loading() ? '…' : 'Send reset link →' }}
          </button>

          <p class="text-sm text-ink-600 mt-6">
            Remember your password? <a routerLink="/login" class="text-primary font-semibold">Back to login →</a>
          </p>
        </form>
      </div>

      <div class="rounded-2xl bg-ink-900 text-white p-10 relative overflow-hidden">
        <div class="absolute inset-0 opacity-30"
             style="background-image:radial-gradient(circle at 70% 40%, #FF2D3D 0%, transparent 60%)"></div>
        <div class="relative">
          <h2 class="font-display text-3xl font-bold mb-2">Regain access<br/>to your account.</h2>
          <p class="text-ink-300">Check your email for further instructions.</p>
        </div>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    this.auth.requestPasswordReset(this.form.getRawValue().email).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.success.set(res.message || 'Reset link sent! Check your email for further instructions.');
        // Clear form after success
        this.form.reset();
        // Optionally redirect after delay
        setTimeout(() => this.router.navigateByUrl('/login'), 3000);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to send reset link. Please try again.');
      }
    });
  }
}
