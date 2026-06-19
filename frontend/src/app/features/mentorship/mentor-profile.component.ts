import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ec-mentor-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-3xl">
      <p class="text-xs font-mono text-primary mb-2">▸ BECOME A MENTOR</p>
      <h1 class="font-display text-3xl font-bold mb-2">Offer mentorship to juniors.</h1>
      <p class="text-ink-600 mb-8">
        Your mentor profile is reviewed by an admin before being listed in the mentorship hub.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        <div>
          <label class="label">Bio — what you can help with</label>
          <textarea class="field" rows="5" formControlName="bio"
                    placeholder="I'm a Staff ML Engineer at Meta with 8 years on RecSys.
I can help with system design, ML interview prep, and EU career moves..."></textarea>
        </div>

        <div>
          <label class="label">Expertise (comma-separated tags)</label>
          <input class="field" formControlName="expertiseRaw"
                 placeholder="RecSys, PyTorch, NLP, MLOps" />
          <p class="text-xs text-ink-600 mt-1">
            Used by the matching algorithm to recommend you to mentees.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Hours / week</label>
            <input class="field" type="number" min="1" max="20"
                   formControlName="availabilityHours" />
          </div>
          <label class="inline-flex items-center gap-2 text-sm self-end pb-3">
            <input type="checkbox" formControlName="acceptsFlash" />
            Open to flash sessions (one-off)
          </label>
        </div>

        <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
          <p class="text-sm text-primary">{{ error() }}</p>
        </div>
        <div *ngIf="success()" class="rounded-lg bg-green-50 border border-green-300 p-3">
          <p class="text-sm text-green-800">{{ success() }}</p>
        </div>

        <div class="flex gap-3 pt-2">
          <a routerLink="/mentorship" class="btn-secondary">← Cancel</a>
          <button type="submit" class="btn-primary flex-1" [disabled]="loading()">
            {{ loading() ? '…' : 'Submit for review →' }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class MentorProfileComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);

  protected form = this.fb.nonNullable.group({
    bio: ['', [Validators.maxLength(4000)]],
    expertiseRaw: [''],
    availabilityHours: [2, [Validators.min(1), Validators.max(40)]],
    acceptsFlash: [true]
  });

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    this.loading.set(true);
    const v = this.form.getRawValue();
    const payload = {
      bio: v.bio,
      expertiseAreas: v.expertiseRaw.split(',').map(s => s.trim()).filter(s => s.length > 0),
      availabilityHours: v.availabilityHours,
      acceptsFlash: v.acceptsFlash
    };
    this.http.put(`${environment.apiUrl}/mentorship/me`, payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Submitted! An admin will review it shortly.');
        setTimeout(() => this.router.navigateByUrl('/mentorship'), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 403) {
          this.error.set('Only mentors and alumni can offer mentorship. Update your account role.');
        } else {
          this.error.set(err?.error?.message ?? 'Could not save mentor profile.');
        }
      }
    });
  }
}
