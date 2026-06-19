import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface BackendFieldError { field: string; message: string; }

@Component({
  selector: 'ec-job-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-3xl">
      <p class="text-xs font-mono text-primary mb-2">▸ NEW JOB POST</p>
      <h1 class="font-display text-3xl font-bold mb-2">Post a job to the network.</h1>
      <p class="text-ink-600 mb-8">
        Submissions are reviewed by an admin before being shown in the public job board.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        <div>
          <label class="label">Title</label>
          <input class="field" formControlName="title"
                 placeholder="Senior ML Engineer — RecSys" />
          <p *ngIf="touched('title')" class="text-xs text-primary mt-1">
            Title is required (max 200 chars).
          </p>
        </div>

        <div>
          <label class="label">Company name</label>
          <input class="field" formControlName="companyName" placeholder="Meta" />
          <p *ngIf="touched('companyName')" class="text-xs text-primary mt-1">
            Company name is required.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Job type</label>
            <select class="field" formControlName="type">
              <option value="FULL_TIME">Full-time</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="PART_TIME">Part-time</option>
              <option value="FREELANCE">Freelance</option>
            </select>
          </div>
          <div>
            <label class="label">Location</label>
            <input class="field" formControlName="location" placeholder="London, UK" />
          </div>
        </div>

        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" formControlName="remote" />
          Remote-friendly
        </label>

        <div>
          <label class="label">Description</label>
          <textarea class="field" rows="6" formControlName="description"
                    placeholder="What you'll work on, the team, the stack..."></textarea>
          <p *ngIf="touched('description')" class="text-xs text-primary mt-1">
            Description is required.
          </p>
        </div>

        <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
          <p class="text-sm text-primary font-semibold">{{ error() }}</p>
          <ul *ngIf="serverFieldErrors().length" class="text-xs text-primary mt-1">
            <li *ngFor="let fe of serverFieldErrors()">
              <span class="font-mono">{{ fe.field }}</span>: {{ fe.message }}
            </li>
          </ul>
        </div>

        <div *ngIf="success()" class="rounded-lg bg-green-50 border border-green-300 p-3">
          <p class="text-sm text-green-800">{{ success() }}</p>
        </div>

        <div class="flex gap-3 pt-2">
          <a routerLink="/jobs" class="btn-secondary">← Cancel</a>
          <button type="submit" class="btn-primary flex-1" [disabled]="loading()">
            {{ loading() ? '…' : 'Submit for review →' }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class JobCreateComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);
  protected serverFieldErrors = signal<BackendFieldError[]>([]);

  protected form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    companyName: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.required]],
    type: ['FULL_TIME' as 'FULL_TIME' | 'INTERNSHIP' | 'PART_TIME' | 'FREELANCE',
           [Validators.required]],
    location: ['', [Validators.maxLength(160)]],
    remote: [false]
  });

  touched(name: 'title' | 'companyName' | 'description'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    this.serverFieldErrors.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Please fill in the required fields.');
      return;
    }
    this.loading.set(true);
    this.http.post(`${environment.apiUrl}/jobs`, this.form.getRawValue()).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Submitted! An admin will review it shortly.');
        setTimeout(() => this.router.navigateByUrl('/jobs'), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        const body = err?.error;
        if (err.status === 403) {
          this.error.set('Only recruiters can post jobs. Update your account role.');
        } else {
          this.error.set(body?.message ?? 'Could not submit job.');
          if (Array.isArray(body?.fieldErrors)) {
            this.serverFieldErrors.set(body.fieldErrors as BackendFieldError[]);
          }
        }
      }
    });
  }
}
