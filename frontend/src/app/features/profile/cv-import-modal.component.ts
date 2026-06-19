import {
  Component, EventEmitter, Input, Output, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CvImportRequest, CvImportResult, CvPreview, ProfileApi,
} from './profile.service';
import { ToastService } from '../../shared/toast.service';
import { RouterLink } from '@angular/router';

/**
 * Two-step modal:
 *   STEP 1 — user picks a PDF, we POST /me/cv/parse and render the
 *            structured preview returned by Ollama (or regex fallback).
 *   STEP 2 — user de-selects rows they don't want, then we commit via
 *            POST /me/cv/import. Selections are local to the modal until
 *            commit; nothing touches the profile until "Import selected".
 *
 * The selection state is kept in 3 parallel Sets keyed by index (0-based).
 * That's simpler than mutating the preview, and lets the user revert
 * accidental un-checks without re-parsing the PDF.
 */
@Component({
  selector: 'ec-cv-import-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
         (click)="closeIfBackdrop($event)">
      <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto
                  shadow-2xl border border-ink-300/40"
           (click)="$event.stopPropagation()">
        <header class="px-6 py-4 border-b border-ink-300/40 flex justify-between items-center">
          <div>
            <p class="text-xs font-mono text-primary">▸ IMPORT FROM CV</p>
            <h2 class="font-display text-2xl font-bold">
              {{ step() === 'upload' ? 'Pick a PDF' :
                 step() === 'parsing' ? 'Reading your CV…' :
                 step() === 'preview' ? 'Confirm what to import' : 'Import complete' }}
            </h2>
          </div>
          <button (click)="close.emit()"
                  class="text-ink-400 hover:text-ink-700 text-2xl leading-none">×</button>
        </header>

        <!-- STEP 1: upload -->
        <section *ngIf="step() === 'upload'" class="p-6 space-y-4">
          <p class="text-sm text-ink-600">
            Upload a PDF version of your CV. We'll extract your experience,
            skills, and education and let you confirm what to import. Your
            current profile won't change until you click <strong>Import selected</strong>.
          </p>
          <label class="block border-2 border-dashed border-ink-300 rounded-lg
                        p-8 text-center cursor-pointer hover:border-primary transition">
            <input type="file" accept="application/pdf" hidden
                   (change)="onFile($event)" />
            <p class="text-ink-500">📄 Click to pick a PDF (max 10 MB)</p>
            <p class="text-xs text-ink-400 mt-1 font-mono">scanned/image PDFs are not supported</p>
          </label>
          <p *ngIf="errorMsg()" class="text-sm text-primary">{{ errorMsg() }}</p>
          <div *ngIf="cvAttached()"
               class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-ink-700">
            ✓ Your CV has been attached to your profile.
            <button class="btn-primary w-full mt-2" (click)="finish.emit()">Done</button>
          </div>
        </section>

        <!-- STEP 2: parsing -->
        <section *ngIf="step() === 'parsing'" class="p-10 text-center">
          <div class="inline-block w-10 h-10 rounded-full border-4 border-primary/30
                      border-t-primary animate-spin"></div>
          <p class="mt-4 text-sm text-ink-600">
            Parsing your CV with the local AI model — this can take 10-30 seconds.
          </p>
        </section>

        <!-- STEP 3: preview + selection -->
        <section *ngIf="step() === 'preview' && preview() as p" class="p-6 space-y-6">
          <div class="rounded-lg bg-red-50 border border-primary/20 p-3 text-xs flex
                      justify-between items-center">
            <span>
              <strong>Source:</strong>
              {{ p.aiProvider === 'ollama' ? '🤖 Ollama (high confidence)' : '🛠 regex parser (low confidence — please review carefully)' }}
            </span>
            <span class="font-mono">{{ (p.confidence * 100) | number:'1.0-0' }}% confidence</span>
          </div>

          <!-- Headline + summary -->
          <div *ngIf="p.headline || p.summary" class="space-y-2">
            <p class="text-xs font-mono text-primary">▸ HEADLINE / SUMMARY</p>
            <label *ngIf="p.headline" class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox"
                     [checked]="includeHeadline()"
                     (change)="includeHeadline.set($any($event.target).checked)" />
              <span><strong>Headline:</strong> {{ p.headline }}</span>
            </label>
            <label *ngIf="p.summary" class="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox"
                     [checked]="includeSummary()"
                     (change)="includeSummary.set($any($event.target).checked)" />
              <span><strong>About:</strong> {{ p.summary }}</span>
            </label>
          </div>

          <!-- Experiences -->
          <div *ngIf="p.experiences.length">
            <div class="flex justify-between items-baseline mb-2">
              <p class="text-xs font-mono text-primary">▸ EXPERIENCE ({{ p.experiences.length }})</p>
              <button class="text-xs text-primary" (click)="toggleAll('experiences')">
                {{ allSelected('experiences') ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <ul class="space-y-2">
              <li *ngFor="let e of p.experiences; let i = index"
                  class="flex items-start gap-3 p-3 rounded-lg border border-ink-300/50"
                  [class.opacity-50]="!selectedExp().has(i)">
                <input type="checkbox" class="mt-1"
                       [checked]="selectedExp().has(i)"
                       (change)="toggle('experiences', i)" />
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm">{{ e.title }} <span class="text-ink-500 font-normal">· {{ e.company }}</span></p>
                  <p class="text-xs text-ink-500 font-mono">
                    {{ e.startDate || '?' }} → {{ e.endDate || 'present' }}
                    <span *ngIf="e.location"> · {{ e.location }}</span>
                  </p>
                  <p *ngIf="e.description" class="text-xs text-ink-600 mt-1 whitespace-pre-wrap line-clamp-3">{{ e.description }}</p>
                </div>
              </li>
            </ul>
          </div>

          <!-- Skills -->
          <div *ngIf="p.skills.length">
            <div class="flex justify-between items-baseline mb-2">
              <p class="text-xs font-mono text-primary">▸ SKILLS ({{ p.skills.length }})</p>
              <button class="text-xs text-primary" (click)="toggleAll('skills')">
                {{ allSelected('skills') ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <label *ngFor="let s of p.skills; let i = index"
                     class="inline-flex items-center gap-2 text-sm cursor-pointer
                            px-3 py-1.5 rounded-full border"
                     [class.border-primary]="selectedSkill().has(i)"
                     [class.bg-red-50]="selectedSkill().has(i)"
                     [class.border-ink-300]="!selectedSkill().has(i)">
                <input type="checkbox" class="!w-3 !h-3"
                       [checked]="selectedSkill().has(i)"
                       (change)="toggle('skills', i)" />
                {{ s.name }}<span *ngIf="s.level" class="text-xs text-ink-500">· ★{{ s.level }}</span>
              </label>
            </div>
          </div>

          <!-- Education -->
          <div *ngIf="p.education.length">
            <div class="flex justify-between items-baseline mb-2">
              <p class="text-xs font-mono text-primary">▸ EDUCATION ({{ p.education.length }})</p>
              <button class="text-xs text-primary" (click)="toggleAll('education')">
                {{ allSelected('education') ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <ul class="space-y-2">
              <li *ngFor="let ed of p.education; let i = index"
                  class="flex items-start gap-3 p-3 rounded-lg border border-ink-300/50"
                  [class.opacity-50]="!selectedEdu().has(i)">
                <input type="checkbox" class="mt-1"
                       [checked]="selectedEdu().has(i)"
                       (change)="toggle('education', i)" />
                <div class="flex-1">
                  <p class="font-bold text-sm">🎓 {{ ed.title }}</p>
                  <p class="text-xs text-ink-500">{{ ed.subtitle }}<span *ngIf="ed.period"> · {{ ed.period }}</span></p>
                </div>
              </li>
            </ul>
          </div>

          <div *ngIf="!p.experiences.length && !p.skills.length && !p.education.length"
               class="text-center text-ink-600 text-sm py-6 space-y-3">
            <p>
              We couldn't auto-extract structured details from this PDF (it may be a
              scanned image or use an unusual layout) — but your CV has been
              <strong>attached to your profile</strong>. You can add your experience
              and skills manually anytime.
            </p>
            <button class="btn-primary" (click)="finish.emit()">Done</button>
          </div>

          <div class="flex gap-3 pt-2 border-t border-ink-300/40">
            <button class="btn-secondary" (click)="reset()">← Pick another PDF</button>
            <button class="btn-primary flex-1"
                    [disabled]="importing() || !somethingSelected()"
                    (click)="commit()">
              {{ importing() ? 'Importing…' :
                 'Import selected (' + totalSelected() + ' item' + (totalSelected() === 1 ? '' : 's') + ')' }}
            </button>
          </div>
        </section>

        <!-- STEP 4: result -->
        <section *ngIf="step() === 'done' && result() as r" class="p-6 space-y-5">
          <div class="text-center">
            <p class="text-5xl mb-2">✅</p>
            <h3 class="font-display text-xl font-bold">Imported into your profile</h3>
            <ul class="text-sm text-ink-600 space-y-1 mt-2">
              <li>{{ r.experiencesAdded }} experience(s)</li>
              <li>{{ r.skillsAdded }} skill(s)</li>
              <li>{{ r.educationAdded }} education entry(ies)</li>
            </ul>
          </div>

          <div *ngIf="r.suggestedJobs?.length" class="rounded-lg border border-primary/30 bg-primary/5 p-4 text-left">
            <p class="text-xs font-mono text-primary mb-3">▸ JOBS MATCHING YOUR CV</p>
            <ol class="space-y-2">
              <li *ngFor="let j of r.suggestedJobs"
                  class="flex items-center justify-between gap-3 p-3 rounded-lg bg-white border border-ink-300/40">
                <div class="min-w-0">
                  <p class="font-bold text-sm truncate">{{ j.title }}</p>
                  <p class="text-xs text-ink-500 truncate">{{ j.companyName }} · {{ j.location || 'Remote' }}</p>
                  <div *ngIf="j.matchingSkills?.length" class="flex flex-wrap gap-1 mt-1">
                    <span *ngFor="let s of j.matchingSkills" class="chip-red text-[10px]">{{ s }}</span>
                  </div>
                </div>
                <span class="font-display text-lg font-bold text-primary shrink-0">{{ j.matchScore }}%</span>
              </li>
            </ol>
            <a routerLink="/jobs" class="btn-primary w-full mt-4 text-center block" (click)="finish.emit()">
              View all matching jobs →
            </a>
          </div>

          <div class="flex gap-3 justify-center">
            <button *ngIf="!r.suggestedJobs?.length" class="btn-primary" (click)="finish.emit()">Done</button>
            <button *ngIf="r.suggestedJobs?.length" class="btn-secondary" (click)="finish.emit()">Close</button>
          </div>
        </section>
      </div>
    </div>
  `,
})
export class CvImportModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() finish = new EventEmitter<void>();

  private api = inject(ProfileApi);
  private toast = inject(ToastService);

  protected step = signal<'upload' | 'parsing' | 'preview' | 'done'>('upload');
  protected preview = signal<CvPreview | null>(null);
  protected result = signal<CvImportResult | null>(null);
  protected errorMsg = signal<string | null>(null);
  protected importing = signal(false);
  /** True once the picked CV file has been attached to the profile — happens
   *  on every pick so any CV is accepted regardless of what the parser finds. */
  protected cvAttached = signal(false);

  // Signals so the totalSelected computed actually re-runs when these change.
  protected includeHeadline = signal(true);
  protected includeSummary = signal(true);

  // Selection sets — default to "everything selected"
  protected selectedExp = signal<Set<number>>(new Set());
  protected selectedSkill = signal<Set<number>>(new Set());
  protected selectedEdu = signal<Set<number>>(new Set());

  protected totalSelected = computed(() =>
    this.selectedExp().size + this.selectedSkill().size + this.selectedEdu().size
    + (this.includeHeadline() && this.preview()?.headline ? 1 : 0)
    + (this.includeSummary() && this.preview()?.summary ? 1 : 0)
  );

  protected somethingSelected = computed(() => this.totalSelected() > 0);

  onFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      this.errorMsg.set('File exceeds 10 MB.'); return;
    }
    this.errorMsg.set(null);
    this.cvAttached.set(false);
    this.step.set('parsing');

    // Always attach the CV to the profile first, so *any* CV is accepted —
    // even a scanned/image PDF the text parser can't read.
    this.api.uploadCv(file).subscribe({
      next: () => this.cvAttached.set(true),
      error: () => { /* non-fatal: the parse path still runs */ },
    });

    // Then try to auto-extract structured content (optional bonus).
    this.api.parseCv(file).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.selectedExp.set(new Set(p.experiences.map((_, i) => i)));
        this.selectedSkill.set(new Set(p.skills.map((_, i) => i)));
        this.selectedEdu.set(new Set(p.education.map((_, i) => i)));
        this.step.set('preview');
      },
      error: (err) => {
        // Parsing failed, but the CV was attached above — don't dead-end.
        this.step.set('upload');
        this.errorMsg.set(
          (err?.error?.message ?? 'Could not auto-read this PDF')
          + ' — your CV is still attached to your profile.');
      },
    });
  }

  toggle(kind: 'experiences' | 'skills' | 'education', i: number): void {
    const sig = kind === 'experiences' ? this.selectedExp
              : kind === 'skills'      ? this.selectedSkill
                                       : this.selectedEdu;
    const next = new Set(sig());
    next.has(i) ? next.delete(i) : next.add(i);
    sig.set(next);
  }

  toggleAll(kind: 'experiences' | 'skills' | 'education'): void {
    const p = this.preview(); if (!p) return;
    const all = kind === 'experiences' ? p.experiences
              : kind === 'skills'      ? p.skills
                                       : p.education;
    const sig = kind === 'experiences' ? this.selectedExp
              : kind === 'skills'      ? this.selectedSkill
                                       : this.selectedEdu;
    sig.set(sig().size === all.length ? new Set() : new Set(all.map((_, i) => i)));
  }

  allSelected(kind: 'experiences' | 'skills' | 'education'): boolean {
    const p = this.preview(); if (!p) return false;
    const all = kind === 'experiences' ? p.experiences
              : kind === 'skills'      ? p.skills
                                       : p.education;
    const sig = kind === 'experiences' ? this.selectedExp()
              : kind === 'skills'      ? this.selectedSkill()
                                       : this.selectedEdu();
    return all.length > 0 && sig.size === all.length;
  }

  reset(): void {
    this.preview.set(null);
    this.step.set('upload');
  }

  commit(): void {
    const p = this.preview(); if (!p) return;
    const req: CvImportRequest = {
      importHeadline: this.includeHeadline() && !!p.headline,
      headline: p.headline,
      importSummary: this.includeSummary() && !!p.summary,
      summary: p.summary,
      experiences: p.experiences.filter((_, i) => this.selectedExp().has(i)),
      skills:      p.skills     .filter((_, i) => this.selectedSkill().has(i)),
      education:   p.education  .filter((_, i) => this.selectedEdu().has(i)),
    };
    this.importing.set(true);
    this.api.importCv(req).subscribe({
      next: (r) => {
        this.importing.set(false);
        this.result.set(r);
        this.step.set('done');
        this.toast.success(`Imported ${r.experiencesAdded + r.skillsAdded + r.educationAdded} item(s).`);
      },
      error: (err) => {
        this.importing.set(false);
        this.toast.error(err?.error?.message ?? 'Import failed.');
      },
    });
  }

  closeIfBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.close.emit();
  }
}
