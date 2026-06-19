import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Role } from '../models/signup-state.model';
import { ToastService } from '../../../shared/toast.service';
import { DropZoneComponent } from './drop-zone.component';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

@Component({
  selector: 'ec-document-upload',
  standalone: true,
  imports: [CommonModule, DropZoneComponent],
  template: `
    <h2 class="font-display text-2xl font-bold mb-2">Upload your documents</h2>
    <p class="text-ink-600 text-sm mb-6">{{ subtitle() }}</p>

    <div class="grid md:grid-cols-2 gap-4">
      <ec-drop-zone
        *ngIf="true"
        label="ID document"
        [file]="idFile()"
        (fileChange)="setIdFile($event)"></ec-drop-zone>

      <ec-drop-zone
        *ngIf="requiresSecondary()"
        [label]="secondaryLabel()"
        [file]="secondaryFile()"
        (fileChange)="setSecondaryFile($event)"></ec-drop-zone>
    </div>

    <p *ngIf="error()" class="text-sm text-primary mt-4">{{ error() }}</p>

    <div class="flex gap-3 pt-6">
      <button *ngIf="showBack"
              class="btn-secondary" (click)="back.emit()">← Back</button>
      <button class="btn-primary flex-1"
              (click)="submit()"
              [disabled]="!canSubmit() || loading()">
        {{ loading() ? 'Verifying…' : 'Verify documents →' }}
      </button>
    </div>
    <!-- Identity verification is optional at signup: a single ghost button
         lets the user opt out and complete signup without uploading any
         documents. Their account still goes to PENDING_APPROVAL so an
         admin can decide whether to onboard them as-is or request
         verification later. Hidden when the wizard is running in
         "resume identity" mode — admin asked for verification, skipping
         would just send them back to where they started. -->
    <button *ngIf="showSkip"
            class="block mx-auto mt-4 text-xs text-ink-600 hover:text-primary underline"
            type="button"
            (click)="onSkipClick()"
            [disabled]="loading()">
      Skip for now — I'll verify my identity later
    </button>
  `,
})
export class DocumentUploadComponent {
  @Input({ required: true }) role!: Role;
  /** When false the "Skip for now" link is hidden. Set to false by the
   *  wizard when the flow is opened in admin-requested resume mode. */
  @Input() showSkip = true;
  /** When false the "← Back" button is hidden. The wizard sets this off
   *  in resume-identity mode where there's no earlier step to go back to. */
  @Input() showBack = true;
  @Output() back = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<{ idFile: File; secondaryFile: File | null }>();
  @Output() skip = new EventEmitter<void>();

  private toast = inject(ToastService);

  protected idFile = signal<File | null>(null);
  protected secondaryFile = signal<File | null>(null);
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  requiresSecondary(): boolean {
    return this.role === 'ALUMNI' || this.role === 'MENTOR' || this.role === 'RECRUITER';
  }

  secondaryLabel(): string {
    switch (this.role) {
      case 'ALUMNI':    return 'ESPRIT degree / diploma';
      case 'MENTOR':    return 'Degree or professional certificate';
      case 'RECRUITER': return 'Corporate proof (business card, employment letter, …)';
      default:          return 'Secondary document';
    }
  }

  subtitle(): string {
    if (this.requiresSecondary()) {
      return 'JPG, PNG, WEBP or PDF · max 5 MB · we extract text and check the names match.';
    }
    return 'Upload a clear photo of your government ID. JPG, PNG, WEBP or PDF · max 5 MB.';
  }

  setIdFile(f: File | null): void {
    if (f && !this.validate(f)) return;
    this.idFile.set(f);
    this.error.set(null);
  }

  setSecondaryFile(f: File | null): void {
    if (f && !this.validate(f)) return;
    this.secondaryFile.set(f);
    this.error.set(null);
  }

  canSubmit(): boolean {
    if (!this.idFile()) return false;
    if (this.requiresSecondary() && !this.secondaryFile()) return false;
    return true;
  }

  onSkipClick(): void {
    this.skip.emit();
  }

  setLoading(v: boolean): void { this.loading.set(v); }
  setError(msg: string | null): void { this.error.set(msg); }

  submit(): void {
    if (!this.canSubmit()) return;
    this.submitted.emit({
      idFile: this.idFile()!,
      secondaryFile: this.secondaryFile(),
    });
  }

  private validate(f: File): boolean {
    if (!ALLOWED.has(f.type)) {
      this.error.set(`${f.name}: only JPG, PNG, WEBP, PDF accepted.`);
      this.toast.error('Unsupported file type.');
      return false;
    }
    if (f.size > MAX_BYTES) {
      this.error.set(`${f.name}: file is larger than 5 MB.`);
      this.toast.error('File too large.');
      return false;
    }
    return true;
  }
}
