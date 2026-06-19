import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'soon';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  /** Read-only signal of currently visible toasts. */
  readonly toasts = signal<Toast[]>([]);

  success(text: string) { this.push('success', text); }
  error(text: string)   { this.push('error', text); }
  info(text: string)    { this.push('info', text); }

  /** Use this for "feature exists in the UI but isn't wired to backend yet." */
  soon(featureLabel: string) {
    this.push('soon', `${featureLabel} — coming soon.`);
  }

  dismiss(id: number) {
    this.toasts.update(arr => arr.filter(t => t.id !== id));
  }

  private push(kind: ToastKind, text: string) {
    const id = ++this.seq;
    this.toasts.update(arr => [...arr, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), 3500);
  }
}
