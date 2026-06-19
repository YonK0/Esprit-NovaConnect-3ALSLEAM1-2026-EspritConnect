import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ec-group-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-3xl">
      <p class="text-xs font-mono text-primary mb-2">▸ NEW GROUP</p>
      <h1 class="font-display text-3xl font-bold mb-2">Start a community.</h1>
      <p class="text-ink-600 mb-8">
        Groups are reviewed by an admin to keep the network on-topic.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        <div>
          <label class="label">Group banner (optional)</label>
          <div *ngIf="bannerPreview()" class="relative mb-3 rounded-xl overflow-hidden border border-ink-300">
            <img [src]="bannerPreview()!" alt="Group banner preview"
                 class="w-full max-h-48 object-cover" />
            <button type="button"
                    class="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs"
                    (click)="clearBanner()">
              Remove
            </button>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-ink-600 cursor-pointer hover:text-primary">
            📷 Add group banner
            <input type="file" accept="image/*" hidden (change)="onBannerFile($event)" />
          </label>
          <p class="text-xs text-ink-500 mt-1">JPG, PNG or GIF · max 8 MB</p>
        </div>

        <div>
          <label class="label">Group name</label>
          <input class="field" formControlName="name"
                 placeholder="Founders Circle" />
        </div>

        <div>
          <label class="label">Type</label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" *ngFor="let t of types" (click)="setType(t.value)"
                    class="px-3 py-2 rounded-lg border text-left text-sm"
                    [class.border-primary]="form.value.type === t.value"
                    [class.bg-red-50]="form.value.type === t.value"
                    [class.border-ink-300]="form.value.type !== t.value">
              <span class="font-mono text-xs text-primary">{{ t.value }}</span>
              <span class="block">{{ t.label }}</span>
            </button>
          </div>
        </div>

        <div>
          <label class="label">Description</label>
          <textarea class="field" rows="4" formControlName="description"
                    placeholder="Who is this group for? What gets shared here?"></textarea>
        </div>

        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" formControlName="isPrivate" />
          Private (members must be approved by the owner)
        </label>

        <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
          <p class="text-sm text-primary">{{ error() }}</p>
        </div>
        <div *ngIf="success()" class="rounded-lg bg-green-50 border border-green-300 p-3">
          <p class="text-sm text-green-800">{{ success() }}</p>
        </div>

        <div class="flex gap-3 pt-2">
          <a routerLink="/groups" class="btn-secondary">← Cancel</a>
          <button type="submit" class="btn-primary flex-1" [disabled]="loading()">
            {{ loading() ? '…' : 'Submit for review →' }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class GroupCreateComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);
  protected bannerPreview = signal<string | null>(null);
  private bannerFile: File | null = null;

  protected types: { value: 'PROMO' | 'SPECIALTY' | 'REGION' | 'INTEREST'; label: string }[] = [
    { value: 'PROMO',     label: 'Promo / class year' },
    { value: 'SPECIALTY', label: 'Specialty' },
    { value: 'REGION',    label: 'Region or city' },
    { value: 'INTEREST',  label: 'Interest / topic' }
  ];

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    type: ['INTEREST' as 'PROMO' | 'SPECIALTY' | 'REGION' | 'INTEREST',
           [Validators.required]],
    description: ['', [Validators.maxLength(2000)]],
    isPrivate: [false]
  });

  setType(t: 'PROMO' | 'SPECIALTY' | 'REGION' | 'INTEREST'): void {
    this.form.patchValue({ type: t });
  }

  onBannerFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Only image files are supported.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      this.error.set('Image must not exceed 8 MB.');
      return;
    }
    this.error.set(null);
    if (this.bannerPreview()) URL.revokeObjectURL(this.bannerPreview()!);
    this.bannerFile = file;
    this.bannerPreview.set(URL.createObjectURL(file));
    (ev.target as HTMLInputElement).value = '';
  }

  clearBanner(): void {
    if (this.bannerPreview()) URL.revokeObjectURL(this.bannerPreview()!);
    this.bannerFile = null;
    this.bannerPreview.set(null);
  }

  submit(): void {
    this.error.set(null);
    this.success.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Group name and type are required.');
      return;
    }
    this.loading.set(true);
    this.http.post<{ id: string }>(`${environment.apiUrl}/groups`, this.form.getRawValue()).subscribe({
      next: (created) => {
        if (this.bannerFile && created?.id) {
          const fd = new FormData();
          fd.append('file', this.bannerFile);
          this.http.post(`${environment.apiUrl}/groups/${created.id}/cover`, fd).subscribe({
            next: () => this.finishSuccess(),
            error: () => this.finishSuccess('Group submitted, but the banner could not be uploaded.')
          });
        } else {
          this.finishSuccess();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not create group.');
      }
    });
  }

  private finishSuccess(msg?: string): void {
    this.loading.set(false);
    this.success.set(msg ?? 'Submitted! An admin will review it shortly.');
    setTimeout(() => this.router.navigateByUrl('/groups'), 1500);
  }
}
