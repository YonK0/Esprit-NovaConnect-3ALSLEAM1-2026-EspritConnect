import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output,
         ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropZoneComponent } from './drop-zone.component';
import { WebcamPermissionError, WebcamService, WebcamUnavailableError } from '../services/webcam.service';
import { ToastService } from '../../../shared/toast.service';

type Mode = 'webcam' | 'upload';

@Component({
  selector: 'ec-face-capture',
  standalone: true,
  imports: [CommonModule, DropZoneComponent],
  template: `
    <h2 class="font-display text-2xl font-bold mb-2">Live face capture</h2>
    <p class="text-ink-600 text-sm mb-6">
      Look at the camera, blink slowly, then turn your head a little. We'll grab 3 frames
      and check them against the photo on your ID.
    </p>

    <!-- Mode toggle if both are available -->
    <div *ngIf="mode() === 'upload' && cameraAvailable()"
         class="flex justify-end mb-3">
      <button class="text-xs font-mono text-primary hover:underline"
              (click)="useWebcam()">↺ Use webcam instead</button>
    </div>

    <ng-container *ngIf="mode() === 'webcam'">
      <div class="card !p-0 overflow-hidden mb-4 aspect-video bg-ink-900 relative">
        <video #video class="w-full h-full object-cover" playsinline muted></video>
        <div *ngIf="countdown() !== null"
             class="absolute inset-0 flex items-center justify-center bg-black/40">
          <span class="text-white font-display text-7xl">{{ countdown() }}</span>
        </div>
        <p *ngIf="status()" class="absolute bottom-3 left-3 right-3 text-xs font-mono
                                     text-white bg-black/50 rounded px-3 py-1">
          {{ status() }}
        </p>
      </div>

      <div class="flex gap-2 mb-4">
        <div *ngFor="let f of frames(); let i = index"
             class="flex-1 aspect-video rounded bg-ink-100 border border-ink-300/40
                    flex items-center justify-center overflow-hidden">
          <img *ngIf="f as ff" [src]="thumb(ff)" alt="" class="w-full h-full object-cover" />
          <span *ngIf="!f" class="text-xs font-mono text-ink-500">{{ i + 1 }}</span>
        </div>
      </div>

      <div class="flex gap-3">
        <button class="btn-secondary" (click)="back.emit()">← Back</button>
        <button class="btn-primary flex-1"
                (click)="startCapture()"
                [disabled]="capturing() || submitting()">
          {{ capturing() ? 'Capturing…' : (allFramesReady() ? 'Recapture' : '☼ Capture 3 frames') }}
        </button>
        <button *ngIf="allFramesReady()"
                class="btn-primary flex-1"
                [disabled]="submitting()"
                (click)="submitFrames()">
          {{ submitting() ? 'Verifying…' : 'Submit ✓' }}
        </button>
      </div>

      <p *ngIf="error()" class="text-sm text-primary mt-4">{{ error() }}</p>
    </ng-container>

    <ng-container *ngIf="mode() === 'upload'">
      <p class="text-sm text-ink-600 mb-4">
        No webcam detected — please upload 3 selfies. Try to vary the angle slightly between them.
      </p>
      <div class="grid md:grid-cols-3 gap-3 mb-4">
        <ec-drop-zone *ngFor="let f of frames(); let i = index; trackBy: idx"
                      [label]="'Selfie ' + (i + 1)"
                      [file]="f"
                      (fileChange)="setUploadFrame(i, $event)"></ec-drop-zone>
      </div>

      <div class="flex gap-3">
        <button *ngIf="showBack"
                class="btn-secondary" (click)="back.emit()">← Back</button>
        <button class="btn-primary flex-1"
                (click)="submitFrames()"
                [disabled]="!allFramesReady() || submitting()">
          {{ submitting() ? 'Verifying…' : 'Submit ✓' }}
        </button>
      </div>

      <p *ngIf="error()" class="text-sm text-primary mt-4">{{ error() }}</p>

      <!-- Identity verification is optional: let the user finish signup
           without completing the face-capture step. Their account still
           goes to PENDING_APPROVAL for the admin to onboard. Hidden in
           "resume identity" mode (the admin asked them to verify; we
           don't offer them an opt-out). -->
      <button *ngIf="showSkip"
              class="block mx-auto mt-4 text-xs text-ink-600 hover:text-primary underline"
              type="button"
              (click)="skip.emit()"
              [disabled]="submitting()">
        Skip for now — I'll verify my identity later
      </button>
    </ng-container>
  `,
})
export class FaceCaptureComponent implements OnInit, OnDestroy {
  /** When false the "Skip for now" link is hidden. Set to false by the
   *  wizard when the flow is opened in admin-requested resume mode. */
  @Input() showSkip = true;
  /** When false the "← Back" button is hidden. The wizard sets this off
   *  in resume-identity mode where there's no earlier step to go back to. */
  @Input() showBack = true;
  @Output() back = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<[File, File, File]>();
  @Output() skip = new EventEmitter<void>();

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
  private webcam = inject(WebcamService);
  private toast = inject(ToastService);

  protected mode = signal<Mode>('webcam');
  protected cameraAvailable = signal<boolean>(true);
  protected frames = signal<Array<File | null>>([null, null, null]);
  protected capturing = signal(false);
  protected submitting = signal(false);
  protected error = signal<string | null>(null);
  protected status = signal<string>('Click "Capture" when you are ready.');
  protected countdown = signal<number | null>(null);

  async ngOnInit(): Promise<void> {
    await this.tryOpenWebcam();
  }

  ngOnDestroy(): void {
    this.webcam.close();
  }

  idx(i: number): number { return i; }

  allFramesReady(): boolean {
    return this.frames().every(f => f !== null);
  }

  thumb(f: File): string {
    return URL.createObjectURL(f);
  }

  async useWebcam(): Promise<void> {
    this.mode.set('webcam');
    this.frames.set([null, null, null]);
    setTimeout(() => this.tryOpenWebcam(), 50); // wait for #video to be in DOM
  }

  private async tryOpenWebcam(): Promise<void> {
    this.error.set(null);
    try {
      // The ViewChild may not be ready on the first cycle — defer one tick
      const tryOpen = async () => {
        if (!this.videoRef) {
          setTimeout(tryOpen, 50);
          return;
        }
        await this.webcam.open(this.videoRef.nativeElement);
        this.status.set('Click "Capture" when you are ready.');
      };
      await tryOpen();
    } catch (e: any) {
      this.cameraAvailable.set(false);
      this.mode.set('upload');
      if (e instanceof WebcamPermissionError) {
        this.toast.error('Camera permission denied — falling back to file upload.');
      } else if (e instanceof WebcamUnavailableError) {
        this.toast.info('No camera detected — please upload 3 selfies instead.');
      } else {
        this.toast.error('Could not start the camera.');
      }
    }
  }

  async startCapture(): Promise<void> {
    if (this.capturing() || !this.videoRef) return;
    this.error.set(null);
    this.frames.set([null, null, null]);
    this.capturing.set(true);
    this.status.set('Look at the camera…');
    try {
      // 3 frames, spaced ~1s apart with a quick countdown the user can see
      for (let i = 0; i < 3; i++) {
        if (i === 1) this.status.set('Now blink slowly…');
        if (i === 2) this.status.set('Now turn your head slightly…');
        await this.countdownTo(0, 3);
        const f = await this.webcam.captureFrame(this.videoRef.nativeElement, i + 1);
        this.frames.update(arr => {
          const next = [...arr]; next[i] = f; return next;
        });
      }
      this.status.set('Captured. Submit to verify.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Capture failed.');
    } finally {
      this.capturing.set(false);
      this.countdown.set(null);
    }
  }

  setUploadFrame(index: number, f: File | null): void {
    this.frames.update(arr => {
      const next = [...arr]; next[index] = f; return next;
    });
  }

  submitFrames(): void {
    if (!this.allFramesReady()) return;
    const f = this.frames();
    this.submitting.set(true);
    this.submitted.emit([f[0]!, f[1]!, f[2]!] as [File, File, File]);
  }

  setSubmitting(v: boolean): void { this.submitting.set(v); }
  setError(msg: string | null): void { this.error.set(msg); }

  private async countdownTo(target: number, from: number): Promise<void> {
    for (let n = from; n > target; n--) {
      this.countdown.set(n);
      await sleep(700);
    }
    this.countdown.set(null);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
