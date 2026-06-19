import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

const SPECIALTIES = [
  { code: 'GL', name: 'Génie Logiciel' },
  { code: 'IA', name: 'Intelligence Artificielle' },
  { code: 'RT', name: 'Réseaux & Télécoms' },
  { code: 'INFOTRONIC', name: 'Infotronic' },
  { code: 'CIVIL', name: 'Génie Civil' },
  { code: 'MECA', name: 'Génie Mécanique' }
];

interface BackendFieldError { field: string; message: string; }

@Component({
  selector: 'ec-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="grid md:grid-cols-2 gap-10 min-h-[700px]">
      <div class="card">
        <p class="text-xs font-mono text-primary mb-3">▸ STEP 1 OF 3</p>
        <h1 class="font-display text-4xl font-bold mb-2">Tell us about yourself.</h1>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">First name</label>
              <input type="text" class="field" formControlName="firstName" />
              <p *ngIf="showError('firstName')" class="text-xs text-primary mt-1">
                First name is required.
              </p>
            </div>
            <div>
              <label class="label">Last name</label>
              <input type="text" class="field" formControlName="lastName" />
              <p *ngIf="showError('lastName')" class="text-xs text-primary mt-1">
                Last name is required.
              </p>
            </div>
          </div>

          <div>
            <label class="label">Email</label>
            <input type="email" class="field" formControlName="email"
                   placeholder="you@esprit.tn" />
            <p *ngIf="showError('email')" class="text-xs text-primary mt-1">
              {{ form.controls.email.hasError('required')
                  ? 'Email is required.'
                  : 'Please enter a valid email address.' }}
            </p>
          </div>

          <div>
            <label class="label">Country</label>
            <input type="text" class="field" formControlName="country"
                   placeholder="e.g. Tunisia" list="ec-signup-countries" />
            <datalist id="ec-signup-countries">
              <option *ngFor="let c of countries" [value]="c"></option>
            </datalist>
            <p *ngIf="showError('country')" class="text-xs text-primary mt-1">
              Country is required.
            </p>
          </div>

          <div>
            <label class="label">Password</label>
            <input type="password" class="field" formControlName="password"
                   placeholder="Min 8 chars, 1 uppercase, 1 digit" />
            <ul class="text-xs mt-2 space-y-0.5">
              <li [class.text-primary]="!hasMinLen()"
                  [class.text-green-700]="hasMinLen()">
                {{ hasMinLen() ? '✓' : '·' }} At least 8 characters
              </li>
              <li [class.text-primary]="!hasUppercase()"
                  [class.text-green-700]="hasUppercase()">
                {{ hasUppercase() ? '✓' : '·' }} One uppercase letter
              </li>
              <li [class.text-primary]="!hasDigit()"
                  [class.text-green-700]="hasDigit()">
                {{ hasDigit() ? '✓' : '·' }} One digit
              </li>
            </ul>
          </div>

          <div>
            <label class="label">I am a…</label>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" *ngFor="let r of roles" (click)="setRole(r.value)"
                      class="flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left"
                      [class.border-primary]="selectedRole() === r.value"
                      [class.bg-red-50]="selectedRole() === r.value"
                      [class.border-ink-300]="selectedRole() !== r.value">
                <span class="text-sm font-semibold">{{ r.label }}</span>
                <span class="text-xs text-ink-600">{{ r.hint }}</span>
              </button>
            </div>
            <p class="text-xs text-ink-600 mt-2">
              Recruiters can post jobs · Mentors can offer mentorship.
              All submissions are reviewed by an admin before being published.
            </p>
          </div>

          <div *ngIf="showGraduationYear()">
            <label class="label">Graduation years</label>
            <div class="max-h-48 overflow-y-auto border border-ink-300 rounded-lg p-3">
              <div class="flex flex-wrap gap-2">
                <button type="button" *ngFor="let y of years" (click)="toggleYear(y)"
                        class="px-3 py-2 rounded-lg border text-sm font-mono whitespace-nowrap"
                        [class.bg-primary]="isYearSelected(y)"
                        [class.text-white]="isYearSelected(y)"
                        [class.border-primary]="isYearSelected(y)"
                        [class.border-ink-300]="!isYearSelected(y)">
                  {{ y }}
                </button>
              </div>
            </div>
            <p *ngIf="!form.get('promotionYears')?.value?.length" class="text-xs text-ink-500 mt-2">
              Select at least one graduation year
            </p>
          </div>

          <div *ngIf="showSpecialty()">
            <label class="label">
              Specialties
              <span *ngIf="showMentorMultiSelect()" class="text-xs text-ink-500 font-normal">
                (select all that apply)
              </span>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" *ngFor="let s of specialties"
                      (click)="showMentorMultiSelect() ? toggleMentorSpecialty(s.code) : setSpec(s.code)"
                      class="flex items-center gap-3 px-3 py-2 rounded-lg border text-left"
                      [class.border-primary]="showMentorMultiSelect() ? isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value === s.code)"
                      [class.bg-red-50]="showMentorMultiSelect() ? isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value === s.code)"
                      [class.border-ink-300]="showMentorMultiSelect() ? !isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value !== s.code)">
                <span class="text-xs font-mono px-2 py-1 rounded"
                      [class.bg-primary]="showMentorMultiSelect() ? isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value === s.code)"
                      [class.text-white]="showMentorMultiSelect() ? isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value === s.code)"
                      [class.bg-ink-100]="showMentorMultiSelect() ? !isMentorSpecialtySelected(s.code) : (form.get('specialtyCode')?.value !== s.code)">
                  {{ s.code }}
                </span>
                <span class="text-sm">{{ s.name }}</span>
              </button>
            </div>
          </div>

          <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
            <p class="text-sm text-primary font-semibold">{{ error() }}</p>
            <ul *ngIf="serverFieldErrors().length" class="text-xs text-primary mt-2 space-y-0.5">
              <li *ngFor="let fe of serverFieldErrors()">
                <span class="font-mono">{{ fe.field }}</span>: {{ fe.message }}
              </li>
            </ul>
          </div>

          <div *ngIf="success()" class="rounded-lg bg-green-50 border border-green-300 p-3">
            <p class="text-sm text-green-800">{{ success() }}</p>
          </div>

          <div class="flex gap-3 pt-2">
            <a routerLink="/login" class="btn-secondary">← Back</a>
            <button type="submit" class="btn-primary flex-1" [disabled]="loading()">
              {{ loading() ? '…' : 'Continue →' }}
            </button>
          </div>
        </form>
      </div>

      <div class="rounded-2xl bg-ink-900 text-white p-10">
        <p class="text-xs font-mono text-primary mb-3">▸ AFTER SIGNUP</p>
        <h2 class="font-display text-3xl font-bold mb-3">
          You'll join +15,847 ESPRIT alumni.
        </h2>
        <p class="text-ink-300">
          We'll email you a 6-digit code to confirm your address. Once your
          email is verified, an admin reviews you against the ESPRIT alumni
          registry — you can log in as soon as your account is approved.
        </p>
      </div>
    </div>
  `
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);
  protected serverFieldErrors = signal<BackendFieldError[]>([]);
  protected selectedRole = signal<'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER'>('STUDENT');

  protected specialties = SPECIALTIES;
  protected countries = [
    'Tunisia', 'France', 'Germany', 'Canada', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Spain', 'Italy', 'Belgium',
    'Switzerland', 'Netherlands', 'Sweden', 'Qatar', 'Saudi Arabia',
    'Morocco', 'Algeria', 'Egypt', 'Turkey', 'Luxembourg',
  ];
  protected years = (() => {
    const currentYear = new Date().getFullYear();
    const result: number[] = [];
    for (let y = currentYear; y >= currentYear - 50; y--) {
      result.push(y);
    }
    return result;
  })();
  protected roles: { value: 'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER';
                     label: string; hint: string }[] = [
    { value: 'STUDENT',   label: 'Student',   hint: 'Currently enrolled at ESPRIT' },
    { value: 'ALUMNI',    label: 'Alumni',    hint: 'Graduated, here to connect' },
    { value: 'MENTOR',    label: 'Mentor',    hint: 'Want to mentor juniors' },
    { value: 'RECRUITER', label: 'Recruiter', hint: 'Hiring ESPRIT alumni' }
  ];

  protected form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.maxLength(80)]],
    country: ['', [Validators.required, Validators.maxLength(64)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8),
      Validators.pattern(/^(?=.*[A-Z])(?=.*\d).+$/)]],
    promotionYears: [[] as number[]],
    specialtyCode: ['GL', []],
    mentorSpecialties: [[] as string[]],
    role: ['STUDENT' as 'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER',
           [Validators.required]]
  });

  protected showGraduationYear = computed(() => this.selectedRole() === 'ALUMNI');
  protected showSpecialty = computed(() => this.selectedRole() !== 'RECRUITER');
  protected showMentorMultiSelect = computed(() => this.selectedRole() === 'MENTOR');

  private updateValidators = effect(() => {
    const role = this.selectedRole();
    const promotionYearsCtrl = this.form.get('promotionYears');
    const specialtyCodeCtrl = this.form.get('specialtyCode');
    
    if (role === 'ALUMNI') {
      promotionYearsCtrl?.setValidators([Validators.required]);
      specialtyCodeCtrl?.setValidators([Validators.required]);
    } else if (role === 'STUDENT' || role === 'MENTOR') {
      promotionYearsCtrl?.setValidators([]);
      specialtyCodeCtrl?.setValidators([Validators.required]);
    } else if (role === 'RECRUITER') {
      promotionYearsCtrl?.setValidators([]);
      specialtyCodeCtrl?.setValidators([]);
    }
    
    promotionYearsCtrl?.updateValueAndValidity({ emitEvent: false });
    specialtyCodeCtrl?.updateValueAndValidity({ emitEvent: false });
  });

  setYear(y: number): void { this.form.patchValue({ promotionYears: [y] }); }
  setSpec(c: string): void { this.form.patchValue({ specialtyCode: c }); }
  
  toggleYear(year: number): void {
    const promotionYearsCtrl = this.form.get('promotionYears');
    const current = promotionYearsCtrl?.value ?? [];
    
    // If this year is already selected, deselect it. Otherwise, select only this year.
    const updated = current.includes(year) ? [] : [year];
    promotionYearsCtrl?.patchValue(updated, { emitEvent: true });
  }
  
  isYearSelected(year: number): boolean {
    const years = this.form.get('promotionYears')?.value ?? [];
    return years.includes(year);
  }
  
  toggleMentorSpecialty(code: string): void {
    const current = this.form.get('mentorSpecialties')?.value ?? [];
    const updated = current.includes(code)
      ? current.filter((c: string) => c !== code)
      : [...current, code];
    this.form.patchValue({ mentorSpecialties: updated });
  }
  
  isMentorSpecialtySelected(code: string): boolean {
    const specialties = this.form.get('mentorSpecialties')?.value ?? [];
    return specialties.includes(code);
  }

  setRole(r: 'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER'): void {
    this.selectedRole.set(r);
    this.form.patchValue({ role: r });
    
    // Reset specialty-related fields based on role
    if (r === 'RECRUITER') {
      // Recruiter doesn't need specialties or years
      this.form.patchValue({ specialtyCode: 'GL', mentorSpecialties: [], promotionYears: [] });
    } else if (r === 'MENTOR') {
      // Mentor uses multi-select for specialties
      this.form.patchValue({ mentorSpecialties: [], specialtyCode: 'GL', promotionYears: [] });
    } else {
      // Student and Alumni use single select
      this.form.patchValue({ specialtyCode: 'GL', mentorSpecialties: [], promotionYears: [] });
    }
  }

  showError(name: 'firstName' | 'lastName' | 'country' | 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  private pwd(): string { return this.form.controls.password.value ?? ''; }
  hasMinLen(): boolean { return this.pwd().length >= 8; }
  hasUppercase(): boolean { return /[A-Z]/.test(this.pwd()); }
  hasDigit(): boolean { return /\d/.test(this.pwd()); }

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    this.serverFieldErrors.set([]);

    if (this.form.invalid) {
      // mark everything touched so all errors render
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields before continuing.');
      return;
    }

    // ALL roles go through email verification first — that's the user-
    // facing 6-digit-code page. Non-students then continue to the identity
    // wizard (documents + face) after their email is confirmed. We pass
    // the role + identity fields along so the wizard can preselect them
    // and skip the role/basic-info steps.
    this.loading.set(true);
    const v = this.form.getRawValue();
    const email = v.email;
    this.auth.signup(v).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Account created — check your inbox for a 6-digit verification code.');
        // After the user enters the code, /verify-email will read these
        // query params and decide whether to send them on to the identity
        // wizard (non-students) or straight to /login (students).
        const params: Record<string, string | number | string[] | number[]> = { email };
        if (v.role === 'ALUMNI') {
          params['role'] = v.role;
          params['firstName'] = v.firstName;
          params['lastName'] = v.lastName;
          params['promotionYears'] = v.promotionYears;
          params['specialtyCode'] = v.specialtyCode;
        } else if (v.role === 'MENTOR') {
          params['role'] = v.role;
          params['firstName'] = v.firstName;
          params['lastName'] = v.lastName;
          params['mentorSpecialties'] = v.mentorSpecialties;
        } else if (v.role === 'RECRUITER') {
          params['role'] = v.role;
          params['firstName'] = v.firstName;
          params['lastName'] = v.lastName;
        }
        // STUDENT doesn't need extra params
        setTimeout(() =>
          this.router.navigate(['/verify-email'], { queryParams: params }),
          1200);
      },
      error: (err) => {
        this.loading.set(false);
        const body = err?.error;
        this.error.set(body?.message ?? 'Signup failed. Please try again.');
        if (Array.isArray(body?.fieldErrors)) {
          this.serverFieldErrors.set(body.fieldErrors as BackendFieldError[]);
        }
      }
    });
  }
}
