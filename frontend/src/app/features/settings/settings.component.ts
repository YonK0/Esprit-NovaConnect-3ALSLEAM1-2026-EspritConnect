import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/toast.service';
import { ProfileApi } from '../profile/profile.service';
import { Profile } from '../profile/profile.types';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ec-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-4xl">
      <div class="mb-8">
        <p class="text-xs font-mono text-primary mb-2">▸ SETTINGS</p>
        <h1 class="font-display text-4xl font-bold">Account settings.</h1>
        <p class="text-ink-600 text-sm mt-1">Manage your personal information and contact details.</p>
      </div>

      <section class="card mb-6 space-y-6">
        <!-- Personal Info -->
        <div class="bg-primary/5 p-4 rounded-lg border border-primary/20">
          <p class="text-xs font-mono text-primary mb-3">▸ PERSONAL INFORMATION</p>
          <div class="grid grid-cols-2 gap-3">
            <input class="field" [(ngModel)]="editFirstName" placeholder="First name" />
            <input class="field" [(ngModel)]="editLastName" placeholder="Last name" />
          </div>
          <div class="mt-2">
            <p class="text-xs text-ink-500 mb-2">📧 Email</p>
            <p class="field bg-ink-200 text-ink-600 text-sm py-2 px-3 rounded cursor-not-allowed mb-2">
              {{ editEmail }}
            </p>
            <p class="text-xs text-ink-500 mb-3">You can change your email address below. We'll send a verification code to the new email.</p>

            <div *ngIf="!emailChangeVerifying()" class="space-y-2">
              <input class="field text-sm" [(ngModel)]="editNewEmail" placeholder="New email address" />
              <button type="button" class="btn-secondary text-xs w-full" (click)="requestEmailChange()"
                      [disabled]="emailChangeRequesting()">
                {{ emailChangeRequesting() ? 'Sending...' : '📨 Send verification code to new email' }}
              </button>
            </div>

            <div *ngIf="emailChangeVerifying()" class="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
              <p class="text-xs text-ink-600 mb-2">We sent a verification code to <strong>{{ editNewEmail }}</strong></p>
              <input class="field text-sm" [(ngModel)]="emailChangeVerificationCode" placeholder="Enter 6-digit code" maxlength="6" />
              <button class="btn-primary text-xs mt-2 w-full" (click)="confirmEmailChange()">
                Verify & Change Email
              </button>
              <button type="button" class="btn-secondary text-xs mt-2 w-full"
                      (click)="emailChangeVerifying.set(false); editNewEmail = ''; emailChangeVerificationCode = ''">
                Cancel
              </button>
            </div>

            <div class="mt-4 pt-4 border-t border-ink-300/30">
              <p class="text-xs font-mono text-primary mb-2">▸ Verify Current Email</p>
              <button type="button" class="btn-secondary text-xs" (click)="resendEmailVerification()">
                {{ emailVerifying() ? 'Sending...' : '📨 Resend verification code' }}
              </button>
              <div *ngIf="emailVerifying()" class="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <input class="field text-sm" [(ngModel)]="emailVerificationCode" placeholder="Enter 6-digit code" maxlength="6" />
                <button class="btn-primary text-xs mt-2 w-full" (click)="verifyEmail()">Verify email</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Contact Info -->
        <div class="bg-ink-50 p-4 rounded-lg border border-ink-200">
          <p class="text-xs font-mono text-primary mb-3">▸ CONTACT INFO</p>
          <div class="grid grid-cols-2 gap-3">
            <input class="field" [(ngModel)]="editCity" placeholder="City" />
            <input class="field" [(ngModel)]="editCountry" placeholder="Country" />
          </div>
          <input class="field mt-3" [(ngModel)]="editPhone" placeholder="Phone number (e.g., +216 XX XXX XXX)" />
        </div>

        <div class="flex gap-3">
          <button class="btn-primary" (click)="saveAccountInfo()">Save</button>
          <button class="btn-secondary" (click)="discardChanges()">Discard</button>
        </div>
      </section>
    </div>
  `
})
export class SettingsComponent implements OnInit {
  private api = inject(ProfileApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private http = inject(HttpClient);

  protected editFirstName = '';
  protected editLastName = '';
  protected editEmail = '';
  protected editCity = '';
  protected editCountry = '';
  protected editPhone = '';

  protected editNewEmail = '';
  protected emailChangeRequesting = signal(false);
  protected emailChangeVerifying = signal(false);
  protected emailChangeVerificationCode = '';
  protected emailVerifying = signal(false);
  protected emailVerificationCode = '';

  private originalData: {
    firstName: string;
    lastName: string;
    city: string;
    country: string;
    phone: string;
  } = { firstName: '', lastName: '', city: '', country: '', phone: '' };

  ngOnInit(): void {
    this.loadUserData();
  }

  private loadUserData(): void {
    this.api.me().subscribe(p => {
      this.editFirstName = p.firstName ?? '';
      this.editLastName = p.lastName ?? '';
      this.editEmail = this.auth.currentUser()?.email ?? '';
      this.editCity = p.city ?? '';
      this.editCountry = p.country ?? '';
      this.editPhone = p.phone ?? '';

      this.originalData = {
        firstName: this.editFirstName,
        lastName: this.editLastName,
        city: this.editCity,
        country: this.editCountry,
        phone: this.editPhone
      };
    });
  }

  saveAccountInfo(): void {
    if (!this.editFirstName.trim() || !this.editLastName.trim()) {
      this.toast.error('First name and last name are required.');
      return;
    }

    const body: Partial<Profile> = {
      firstName: this.editFirstName,
      lastName: this.editLastName,
      city: this.editCity,
      country: this.editCountry,
      phone: this.editPhone
    };

    this.api.patchMe(body).subscribe({
      next: () => {
        this.toast.success('Account information saved successfully.');
        this.loadUserData();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Could not save account information.');
      }
    });
  }

  resendEmailVerification(): void {
    const email = this.auth.currentUser()?.email;
    if (!email) {
      this.toast.error('Email not found in user data.');
      return;
    }
    this.emailVerifying.set(true);
    this.http.post(`${environment.apiUrl}/auth/resend-verification?email=${encodeURIComponent(email)}`, {}).subscribe({
      next: () => {
        this.toast.success('Verification code sent to your email. Check your inbox.');
      },
      error: (err) => {
        this.emailVerifying.set(false);
        this.toast.error(err?.error?.message ?? 'Could not resend verification code.');
      }
    });
  }

  verifyEmail(): void {
    if (!this.emailVerificationCode.trim()) {
      this.toast.error('Please enter the verification code.');
      return;
    }
    const email = this.auth.currentUser()?.email;
    if (!email) {
      this.toast.error('Email not found in user data.');
      return;
    }
    this.http.post(`${environment.apiUrl}/auth/verify-email`, {
      email,
      code: this.emailVerificationCode
    }).subscribe({
      next: () => {
        this.emailVerifying.set(false);
        this.emailVerificationCode = '';
        this.loadUserData();
        this.toast.success('Email verified successfully!');
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Verification failed. Invalid or expired code.');
      }
    });
  }

  requestEmailChange(): void {
    if (!this.editNewEmail.trim()) {
      this.toast.error('Please enter a new email address.');
      return;
    }
    if (!this.isValidEmail(this.editNewEmail)) {
      this.toast.error('Please enter a valid email address.');
      return;
    }
    this.emailChangeRequesting.set(true);
    this.http.post(`${environment.apiUrl}/auth/request-email-change`, {
      newEmail: this.editNewEmail
    }).subscribe({
      next: () => {
        this.emailChangeRequesting.set(false);
        this.emailChangeVerifying.set(true);
        this.toast.success('Verification code sent to your new email address.');
      },
      error: (err) => {
        this.emailChangeRequesting.set(false);
        this.toast.error(err?.error?.message ?? 'Could not send verification code.');
      }
    });
  }

  confirmEmailChange(): void {
    if (!this.emailChangeVerificationCode.trim()) {
      this.toast.error('Please enter the verification code.');
      return;
    }
    this.http.post(`${environment.apiUrl}/auth/confirm-email-change`, {
      code: this.emailChangeVerificationCode
    }).subscribe({
      next: () => {
        this.emailChangeVerifying.set(false);
        this.emailChangeVerificationCode = '';
        this.editNewEmail = '';
        this.loadUserData();
        this.toast.success('Email changed successfully!');
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Verification failed. Invalid or expired code.');
      }
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  discardChanges(): void {
    this.editFirstName = this.originalData.firstName;
    this.editLastName = this.originalData.lastName;
    this.editCity = this.originalData.city;
    this.editCountry = this.originalData.country;
    this.editPhone = this.originalData.phone;
    this.toast.info('Changes discarded.');
  }
}
