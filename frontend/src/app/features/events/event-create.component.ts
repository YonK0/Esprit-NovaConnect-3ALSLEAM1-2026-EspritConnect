import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';

interface CreatedEvent {
  id: string;
}

/** Microsoft Teams join links only. */
const TEAMS_URL_PATTERN =
  /^https?:\/\/([\w.-]+\.)?teams\.(microsoft\.com|live\.com)\/.+/i;

function teamsUrlValidator(control: AbstractControl) {
  const v = (control.value ?? '').trim();
  if (!v) return { required: true };
  return TEAMS_URL_PATTERN.test(v) ? null : { teamsUrl: true };
}

@Component({
  selector: 'ec-event-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-3xl">
      <p class="text-xs font-mono text-primary mb-2">▸ NEW EVENT</p>
      <h1 class="font-display text-3xl font-bold mb-2">Host something the network shows up to.</h1>
      <p class="text-ink-600 mb-8">
        Any member can submit an event. An admin reviews it before it appears on the public calendar.
      </p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        <div>
          <label class="label">Event photo (optional)</label>
          <div *ngIf="bannerPreview()" class="relative mb-3 rounded-xl overflow-hidden border border-ink-300">
            <img [src]="bannerPreview()!" alt="Event banner preview"
                 class="w-full max-h-48 object-cover" />
            <button type="button"
                    class="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-xs"
                    (click)="clearBanner()">
              Remove
            </button>
          </div>
          <label class="inline-flex items-center gap-2 text-sm text-ink-600 cursor-pointer hover:text-primary">
            📷 Add event photo
            <input type="file" accept="image/*" hidden (change)="onBannerFile($event)" />
          </label>
          <p class="text-xs text-ink-500 mt-1">JPG, PNG or GIF · max 8 MB</p>
        </div>

        <div>
          <label class="label">Title</label>
          <input class="field" formControlName="title"
                 placeholder="ESPRIT Career Day — Paris 2026" />
        </div>

        <div>
          <label class="label">Description</label>
          <textarea class="field" rows="4" formControlName="description"
                    placeholder="What's on the agenda? Who's it for?"></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Starts at</label>
            <input class="field" type="datetime-local" formControlName="startAt" />
          </div>
          <div>
            <label class="label">Ends at (optional)</label>
            <input class="field" type="datetime-local" formControlName="endAt" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div *ngIf="!form.value.virtual">
            <label class="label">Location</label>
            <input class="field" formControlName="location" placeholder="Station F, Paris" />
          </div>
          <div [class.col-span-2]="form.value.virtual">
            <label class="label">Capacity (optional)</label>
            <input class="field" type="number" formControlName="capacity" min="1" />
          </div>
        </div>

        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" formControlName="virtual" (change)="onVirtualToggle()" />
          Virtual / online event (Microsoft Teams)
        </label>

        <div *ngIf="form.value.virtual" class="rounded-lg border border-ink-300/60 bg-ink-50/50 p-4 space-y-3">
          <p class="text-xs font-mono text-primary">▸ MICROSOFT TEAMS MEETING</p>
          <p class="text-sm text-ink-600">
            Create the meeting in Microsoft Teams (Calendar → New meeting → Copy join link),
            then paste it below. Only Teams links are accepted for online events.
          </p>
          <div>
            <label class="label">Teams meeting link <span class="text-primary">*</span></label>
            <input class="field" formControlName="meetingUrl"
                   placeholder="https://teams.microsoft.com/l/meetup-join/..." />
            <p *ngIf="form.controls.meetingUrl.touched && form.controls.meetingUrl.hasError('teamsUrl')"
               class="text-xs text-primary mt-1">
              Enter a valid Microsoft Teams link (teams.microsoft.com or teams.live.com).
            </p>
          </div>
        </div>

        <div *ngIf="error()" class="rounded-lg bg-red-50 border border-primary/30 p-3">
          <p class="text-sm text-primary">{{ error() }}</p>
        </div>
        <div *ngIf="success()" class="rounded-lg bg-green-50 border border-green-300 p-3">
          <p class="text-sm text-green-800">{{ success() }}</p>
        </div>

        <div class="flex gap-3 pt-2">
          <a routerLink="/events" class="btn-secondary">← Cancel</a>
          <button type="submit" class="btn-primary flex-1" [disabled]="loading()">
            {{ loading() ? '…' : 'Submit for review →' }}
          </button>
        </div>
      </form>
    </div>
  `
})
export class EventCreateComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected success = signal<string | null>(null);
  protected bannerPreview = signal<string | null>(null);

  private bannerFile: File | null = null;

  protected form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    startAt: ['', [Validators.required]],
    endAt: [''],
    location: [''],
    meetingUrl: [''],
    capacity: [null as number | null],
    virtual: [false]
  });

  onVirtualToggle(): void {
    const meetingUrlCtrl = this.form.controls.meetingUrl;
    if (this.form.value.virtual) {
      meetingUrlCtrl.setValidators([teamsUrlValidator]);
    } else {
      meetingUrlCtrl.clearValidators();
      meetingUrlCtrl.setValue('');
    }
    meetingUrlCtrl.updateValueAndValidity();
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
    if (this.form.value.virtual) {
      this.form.controls.meetingUrl.markAsTouched();
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.value.virtual && this.form.controls.meetingUrl.invalid) {
        this.error.set('A valid Microsoft Teams meeting link is required.');
      } else {
        this.error.set('Title and start date are required.');
      }
      return;
    }
    this.loading.set(true);
    const v = this.form.getRawValue();
    const payload = {
      title: v.title,
      description: v.description,
      startAt: new Date(v.startAt).toISOString(),
      endAt: v.endAt ? new Date(v.endAt).toISOString() : null,
      location: v.virtual ? null : (v.location || null),
      meetingUrl: v.virtual ? v.meetingUrl.trim() : null,
      capacity: v.capacity,
      virtual: v.virtual
    };
    this.http.post<CreatedEvent>(`${environment.apiUrl}/events`, payload).subscribe({
      next: (created) => {
        if (this.bannerFile) {
          const form = new FormData();
          form.append('file', this.bannerFile);
          this.http.post(`${environment.apiUrl}/events/${created.id}/banner`, form).subscribe({
            next: () => this.finishSuccess(),
            error: (err) => {
              this.loading.set(false);
              this.success.set('Event submitted, but the photo could not be uploaded.');
              this.error.set(err?.error?.message ?? 'Banner upload failed.');
              setTimeout(() => this.router.navigateByUrl('/events/manage'), 2000);
            }
          });
        } else {
          this.finishSuccess();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not create event.');
      }
    });
  }

  private finishSuccess(): void {
    this.loading.set(false);
    this.success.set('Submitted! An admin will review it before it goes live.');
    setTimeout(() => this.router.navigateByUrl('/events/manage'), 1500);
  }
}
