import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WizardStep } from '../models/signup-state.model';

interface StepDef {
  id: WizardStep;
  label: string;
  index: number;
}

@Component({
  selector: 'ec-steps-stepper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ol class="flex items-center gap-2 mb-8 text-xs font-mono">
      <li *ngFor="let s of steps; let last = last"
          class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-full flex items-center justify-center
                     border-2 transition-colors"
              [class.border-primary]="state(s) !== 'todo'"
              [class.bg-primary]="state(s) === 'done'"
              [class.text-white]="state(s) === 'done'"
              [class.text-primary]="state(s) === 'current'"
              [class.border-ink-300]="state(s) === 'todo'"
              [class.text-ink-500]="state(s) === 'todo'">
          {{ state(s) === 'done' ? '✓' : (s.index + 1) }}
        </span>
        <span [class.text-primary]="state(s) === 'current'"
              [class.font-semibold]="state(s) === 'current'"
              [class.text-ink-500]="state(s) === 'todo'">
          {{ s.label }}
        </span>
        <span *ngIf="!last" class="w-6 h-px bg-ink-300"></span>
      </li>
    </ol>
  `,
})
export class StepsStepperComponent {
  @Input({ required: true }) currentStep!: WizardStep;

  // Email-verification is owned by the parent screen now — the stepper
  // shows only the three KYC steps that live inside the wizard.
  protected steps: StepDef[] = [
    { id: 'documents', label: 'Documents', index: 0 },
    { id: 'face',      label: 'Face',      index: 1 },
    { id: 'result',    label: 'Result',    index: 2 },
  ];

  protected state(s: StepDef): 'done' | 'current' | 'todo' {
    const current = this.steps.findIndex(x => x.id === this.currentStep);
    if (s.index < current) return 'done';
    if (s.index === current) return 'current';
    return 'todo';
  }
}
