import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Role } from '../models/signup-state.model';

/**
 * Step 1 of the verified-signup wizard. Pure presentational — emits the
 * chosen role and lets the wizard advance.
 */
@Component({
  selector: 'ec-role-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h2 class="font-display text-2xl font-bold mb-2">Who are you?</h2>
    <p class="text-ink-600 text-sm mb-6">
      Pick the role that fits — it determines what documents we'll ask for
      next, and which features unlock once an admin approves your account.
    </p>

    <div class="grid md:grid-cols-2 gap-3">
      <button *ngFor="let r of roles" type="button"
              (click)="pick(r.value)"
              class="text-left p-4 rounded-xl border border-ink-300/40
                     hover:border-primary/60 hover:bg-red-50 transition">
        <p class="text-lg font-bold">{{ r.label }}</p>
        <p class="text-xs text-ink-600 mt-0.5">{{ r.hint }}</p>
        <p class="text-[10px] font-mono text-ink-500 mt-2">
          Requires: {{ r.requires }}
        </p>
      </button>
    </div>
  `,
})
export class RolePickerComponent {
  @Output() roleSelected = new EventEmitter<Role>();

  protected roles: { value: Role; label: string; hint: string; requires: string }[] = [
    { value: 'STUDENT',   label: '🎒 Student',
      hint: 'Currently enrolled at ESPRIT',
      requires: 'student ID + face match' },
    { value: 'ALUMNI',    label: '🎓 Alumni',
      hint: 'Graduated, here to connect & give back',
      requires: 'government ID + ESPRIT diploma + face match' },
    { value: 'MENTOR',    label: '🧑‍🏫 Mentor',
      hint: 'Want to mentor juniors',
      requires: 'government ID + degree / certificate + face match' },
    { value: 'RECRUITER', label: '💼 Recruiter',
      hint: 'Hiring ESPRIT alumni',
      requires: 'government ID + corporate proof + face match' },
  ];

  pick(r: Role): void { this.roleSelected.emit(r); }
}
