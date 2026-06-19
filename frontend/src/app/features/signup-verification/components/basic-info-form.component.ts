import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { inject } from '@angular/core';
import { BasicInfo, Role } from '../models/signup-state.model';

const SPECIALTIES = [
  { code: 'GL',         label: 'Génie Logiciel' },
  { code: 'IA',         label: 'Intelligence Artificielle' },
  { code: 'RT',         label: 'Réseaux & Télécoms' },
  { code: 'INFOTRONIC', label: 'Infotronic' },
  { code: 'CIVIL',      label: 'Génie Civil' },
  { code: 'MECA',       label: 'Génie Mécanique' },
];

/**
 * Step 2 of the wizard — name / email / password / promo / specialty.
 *
 * The host exposes setLoading + setError so it can drive the loading
 * spinner and inline error message from the network call that fires after
 * the form is submitted.
 */
@Component({
  selector: 'ec-basic-info-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  template: `
    <h2 class="font-display text-2xl font-bold mb-2">Tell us about you</h2>
    <p class="text-ink-600 text-sm mb-6">
      We need a few basics before identity verification.
    </p>

    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label">First name</label>
          <input class="field" formControlName="firstName" />
        </div>
        <div>
          <label class="label">Last name</label>
          <input class="field" formControlName="lastName" />
        </div>
      </div>

      <div>
        <label class="label">Email</label>
        <input type="email" class="field" formControlName="email"
               placeholder="you@example.com" />
      </div>

      <div>
        <label class="label">Password</label>
        <input type="password" class="field" formControlName="password"
               placeholder="Min 8 chars · 1 uppercase · 1 digit" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label">Graduation year</label>
          <select class="field" formControlName="promotionYear">
            <option *ngFor="let y of years" [value]="y">{{ y }}</option>
          </select>
        </div>
        <div>
          <label class="label">Specialty</label>
          <select class="field" formControlName="specialtyCode">
            <option *ngFor="let s of specialties" [value]="s.code">
              {{ s.code }} — {{ s.label }}
            </option>
          </select>
        </div>
      </div>

      <p *ngIf="error()" class="text-sm text-primary">{{ error() }}</p>

      <div class="flex gap-3 pt-2">
        <button type="button" class="btn-secondary" (click)="back.emit()">← Back</button>
        <button type="submit" class="btn-primary flex-1"
                [disabled]="form.invalid || loading()">
          {{ loading() ? '…' : 'Continue →' }}
        </button>
      </div>
    </form>
  `,
})
export class BasicInfoFormComponent {
  @Input({ required: true }) role!: Role;
  @Output() back = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<BasicInfo>();

  private fb = inject(FormBuilder);

  protected specialties = SPECIALTIES;
  protected years = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  protected form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(80)]],
    lastName:  ['', [Validators.required, Validators.maxLength(80)]],
    email:     ['', [Validators.required, Validators.email]],
    password:  ['', [Validators.required, Validators.minLength(8),
                      Validators.pattern(/^(?=.*[A-Z])(?=.*\d).+$/)]],
    promotionYear: [2024, [Validators.required]],
    specialtyCode: ['GL', [Validators.required]],
  });

  /** Preselect values when the host hands us partial state. Used when the
   *  simple signup form redirects here with role+name+email+promo+specialty
   *  in the URL query string. */
  patchValues(partial: Partial<{ firstName: string; lastName: string;
                                  email: string; promotionYear: number;
                                  specialtyCode: string }>): void {
    const clean: Record<string, unknown> = {};
    if (partial.firstName) clean['firstName'] = partial.firstName;
    if (partial.lastName)  clean['lastName']  = partial.lastName;
    if (partial.email)     clean['email']     = partial.email;
    if (partial.promotionYear) clean['promotionYear'] = partial.promotionYear;
    if (partial.specialtyCode) clean['specialtyCode'] = partial.specialtyCode;
    if (Object.keys(clean).length) this.form.patchValue(clean as any);
  }

  setLoading(v: boolean): void { this.loading.set(v); }
  setError(msg: string | null): void { this.error.set(msg); }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fix the highlighted fields.');
      return;
    }
    this.error.set(null);
    this.submitted.emit({ ...this.form.getRawValue(), role: this.role });
  }
}
