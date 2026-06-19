import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'ec-reset-password-confirm',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="grid md:grid-cols-2 gap-10 items-stretch min-h-[600px]">
      <div class="card flex flex-col justify-center">
        <p class="text-xs font-mono text-primary mb-3">▸ CREATE NEW PASSWORD</p>
        <h1 class="font-display text-4xl font-bold mb-2">Choose a new<br/>password.</h1>
        <p class="text-ink-600 mb-6">Enter and confirm your new password below.</p>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="label">New Password</label>
            <input type="password" class="field" formControlName="password"
                   placeholder="••••••••" />
            <p *ngIf="form.controls.password.touched && form.controls.password.invalid"
               class="text-xs text-primary mt-1">
              <span *ngIf="form.controls.password.errors?.['required']">Password required.</span>
              <span *ngIf="form.controls.password.errors?.['minlength']">Minimum 8 characters.</span>
            </p>
          </div>

          <div>
            <label class="label">Confirm Password</label>
            <input type="password" class="field" formControlName="confirmPassword"
                   placeholder="••••••••" />
            <p *ngIf="form.controls.confirmPassword.touched && form.controls.confirmPassword.invalid"
               class="text-xs text-primary mt-1">
              <span *ngIf="form.controls.confirmPassword.errors?.['required']">Confirm password required.</span>
              <span *ngIf="form.errors?.['passwordMismatch'] && form.controls.confirmPassword.touched">Passwords do not match.</span>
            </p>
          </div>

          <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
            <p class="text-sm text-primary">{{ error() }}</p>
          </div>

          <div *ngIf="success()" class="rounded-lg bg-green-900/30 border border-green-500/50 p-3">
            <p class="text-sm text-green-300">✓ {{ success() }}</p>
          </div>

          <button type="submit" class="btn-primary w-full"
                  [disabled]="form.invalid || loading() || (success() ? true : false)">
            {{ loading() ? '…' : 'Set new password →' }}
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
          <h2 class="font-display text-3xl font-bold mb-2">Secure password<br/>requirements.</h2>
          <ul class="text-ink-300 text-sm space-y-2 mt-6">
            <li class="flex gap-2">
              <span class="text-green-400">✓</span>
              <span>At least 8 characters</span>
            </li>
            <li class="flex gap-2">
              <span class="text-green-400">✓</span>
              <span>Mix of uppercase & lowercase</span>
            </li>
            <li class="flex gap-2">
              <span class="text-green-400">✓</span>
              <span>Include numbers</span>
            </li>
            <li class="flex gap-2">
              <span class="text-green-400">✓</span>
              <span>Use special characters</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `
})
export class ResetPasswordConfirmComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);
  protected token: string | null = null;

  protected form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, {
    validators: this.passwordMatchValidator
  });

  constructor() {
    // Get token from URL query parameters
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || null;
      if (!this.token) {
        this.error.set('Invalid or missing reset token. Please request a new reset link.');
      }
    });
  }

  submit(): void {
    if (this.form.invalid || !this.token) return;

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const password = this.form.getRawValue().password;
    this.auth.confirmPasswordReset(this.token, password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.success.set(res.message || 'Password successfully reset! Redirecting to login...');
        // Redirect to login after delay
        setTimeout(() => this.router.navigateByUrl('/login'), 2000);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Failed to reset password. Token may have expired.');
      }
    });
  }

  private passwordMatchValidator(group: any): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password && confirmPassword && password !== confirmPassword ? { passwordMismatch: true } : null;
  }
}
