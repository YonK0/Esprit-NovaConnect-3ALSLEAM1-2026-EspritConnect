import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Tiny reusable file picker.
 *
 * Click to browse + drag-drop. Shows the chosen filename and a small
 * thumbnail when the file is an image. Emits null on remove.
 */
@Component({
  selector: 'ec-drop-zone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label class="block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
                  transition-colors h-full"
           [class.border-ink-300]="!dragOver() && !file"
           [class.border-primary]="dragOver() || !!file"
           [class.bg-red-50]="dragOver()"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave()"
           (drop)="onDrop($event)">
      <input type="file" class="hidden"
             accept="image/jpeg,image/png,image/webp,application/pdf"
             (change)="onPick($event)" />

      <ng-container *ngIf="!file; else picked">
        <p class="font-semibold text-sm">{{ label }}</p>
        <p class="text-xs text-ink-500 mt-2">⬆ Click or drag a file here</p>
        <p class="text-[10px] font-mono text-ink-500 mt-1">JPG · PNG · WEBP · PDF · max 5 MB</p>
      </ng-container>

      <ng-template #picked>
        <p class="font-semibold text-sm mb-2">{{ label }}</p>
        <img *ngIf="thumbnail()" [src]="thumbnail()" alt="" class="mx-auto max-h-32 rounded mb-2" />
        <p class="text-xs text-ink-600 truncate">{{ file?.name }}</p>
        <p class="text-[10px] font-mono text-ink-500">{{ sizeKb() }} KB</p>
        <button type="button" class="text-xs text-primary mt-2 hover:underline"
                (click)="clear($event)">× Remove</button>
      </ng-template>
    </label>
  `,
})
export class DropZoneComponent {
  @Input({ required: true }) label!: string;
  @Input() file: File | null = null;
  @Output() fileChange = new EventEmitter<File | null>();

  protected dragOver = signal(false);

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.fileChange.emit(f);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }
  onDragLeave(): void { this.dragOver.set(false); }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const f = event.dataTransfer?.files?.[0] ?? null;
    this.fileChange.emit(f);
  }
  clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.fileChange.emit(null);
  }

  thumbnail(): string | null {
    if (!this.file) return null;
    if (!this.file.type.startsWith('image/')) return null;
    return URL.createObjectURL(this.file);
  }

  sizeKb(): number {
    return this.file ? Math.round(this.file.size / 1024) : 0;
  }
}
