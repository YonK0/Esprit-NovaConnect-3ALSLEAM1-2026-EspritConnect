import { Injectable } from '@angular/core';

export class WebcamPermissionError extends Error {
  constructor(public override readonly cause: string) {
    super(cause);
    this.name = 'WebcamPermissionError';
  }
}

export class WebcamUnavailableError extends Error {
  constructor() {
    super('No camera detected on this device.');
    this.name = 'WebcamUnavailableError';
  }
}

/**
 * Thin wrapper around getUserMedia + canvas frame capture.
 *
 * Kept as a service rather than wired inside the component so the
 * webcam can be stopped reliably even if the component is destroyed
 * mid-flow (Angular's ngOnDestroy isn't guaranteed to fire on tab close,
 * but for nav we want a single owner).
 */
@Injectable({ providedIn: 'root' })
export class WebcamService {
  private stream: MediaStream | null = null;

  async open(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new WebcamUnavailableError();
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err: any) {
      // NotAllowedError, NotFoundError, OverconstrainedError, …
      const name = err?.name ?? '';
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new WebcamUnavailableError();
      }
      throw new WebcamPermissionError(name || 'getUserMedia rejected');
    }
    video.srcObject = this.stream;
    await video.play().catch(() => {/* iOS Safari sometimes blocks autoplay */});
  }

  close(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  /**
   * Capture a single frame from the live video element as a JPEG File.
   * The filename embeds the frame index so the multipart upload stays readable
   * in server logs.
   */
  captureFrame(video: HTMLVideoElement, index: number): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      // Cap output size — 640×480 is enough for face_recognition and keeps
      // the multipart body small (~50 KB per frame at quality 0.85).
      const targetW = Math.min(640, video.videoWidth || 640);
      const targetH = Math.round((video.videoHeight || 480) * (targetW / (video.videoWidth || 640)));
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('toBlob returned null')); return; }
          resolve(new File([blob], `frame-${index}.jpg`, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85,
      );
    });
  }
}
