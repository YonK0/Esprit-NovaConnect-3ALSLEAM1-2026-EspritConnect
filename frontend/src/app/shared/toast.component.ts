import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';

@Component({
  selector: 'ec-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-6 left-6 z-50 space-y-2 max-w-sm pointer-events-none">
      <div *ngFor="let t of toasts.toasts()"
           (click)="toasts.dismiss(t.id)"
           class="pointer-events-auto cursor-pointer px-4 py-3 rounded-lg shadow-lg
                  border text-sm font-medium animate-fade-in flex items-start gap-2"
           [class.bg-green-50]="t.kind === 'success'"
           [class.text-green-800]="t.kind === 'success'"
           [class.border-green-300]="t.kind === 'success'"
           [class.bg-red-50]="t.kind === 'error'"
           [class.text-primary]="t.kind === 'error' || t.kind === 'soon'"
           [class.border-primary]="t.kind === 'error' || t.kind === 'soon'"
           [class.bg-white]="t.kind === 'info'"
           [class.text-ink-800]="t.kind === 'info'"
           [class.border-ink-300]="t.kind === 'info'"
           [class.bg-yellow-50]="t.kind === 'soon'">
        <span class="font-mono text-xs shrink-0">
          {{ icon(t.kind) }}
        </span>
        <span class="flex-1">{{ t.text }}</span>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fade-in 180ms ease-out; }
  `]
})
export class ToastHostComponent {
  protected toasts = inject(ToastService);

  icon(kind: string): string {
    switch (kind) {
      case 'success': return '✓';
      case 'error':   return '✕';
      case 'soon':    return '⏳';
      default:        return 'ⓘ';
    }
  }
}
