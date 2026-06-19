import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  BasicInfo, DocumentVerifyResult, FaceVerifyResult,
  InitResponse, Role, WizardState, WizardStep
} from '../models/signup-state.model';

const STORAGE_KEY = 'ec.signup-wizard';

const ESPRIT_DOMAIN = 'esprit.tn';
const RECRUITER_BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.fr', 'yahoo.co.uk',
  'outlook.com', 'hotmail.com', 'hotmail.fr', 'live.com',
  'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'aol.com',
  'yandex.com', 'yandex.ru', 'gmx.com', 'gmx.de', 'mail.com',
  'zoho.com', 'tutanota.com', 'fastmail.com',
]);

/**
 * State machine for the multi-step signup wizard.
 *
 * State persists to sessionStorage so an accidental refresh after the
 * user has uploaded documents doesn't make them start over. Cleared on
 * a successful PASS or when the user navigates away with `reset()`.
 */
@Injectable({ providedIn: 'root' })
export class SignupFlowService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/auth/signup`;

  private _state = signal<WizardState>(this.loadInitialState());

  readonly state = this._state.asReadonly();
  readonly step = computed(() => this._state().step);
  readonly role = computed(() => this._state().role);
  readonly sessionId = computed(() => this._state().sessionId);
  readonly idFaceB64 = computed(() => this._state().idFaceB64);

  // ---------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------
  setRole(role: Role): void {
    this.patch({ role, step: 'basic' });
  }

  goToStep(step: WizardStep): void {
    this.patch({ step });
  }

  reset(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this._state.set(this.emptyState());
  }

  /**
   * User chose to skip identity verification (face + document upload).
   *
   * Without a backend call the user would stay in DRAFT forever, invisible
   * to the admin approval queue. Hits {@code POST /signup/skip-identity}
   * to flip them to PENDING_APPROVAL, then navigates to the result
   * screen. If the sessionId is missing (e.g. user landed straight on
   * the result step from somewhere), we still navigate so the UI feels
   * responsive — the orchestrator will surface the inconsistency later.
   */
  skipIdentity(): Observable<void> {
    const sessionId = this._state().sessionId;
    const navigate = () => this.patch({ skipped: true, step: 'result' });
    if (!sessionId) {
      navigate();
      // Emit an immediate completion so the caller can chain a toast.
      return new Observable<void>(sub => { sub.next(); sub.complete(); });
    }
    return this.http.post<void>(
      `${this.base}/skip-identity/${sessionId}`, {}
    ).pipe(tap(() => navigate()));
  }

  /**
   * Hand-off path used by the email-verify screen after the OTP is
   * accepted. The backend has already created the user (via the normal
   * `/auth/signup` endpoint) AND set their status to DRAFT, so we can
   * skip the role / basic / init steps and jump straight to documents.
   *
   * @param sessionId  identity-verification session id (the user id)
   * @param role       role declared at signup — used to decide whether a
   *                   secondary document is required at the documents step
   */
  seedFromEmailVerify(sessionId: string, role: Role): void {
    this.patch({
      role,
      sessionId,
      step: 'documents',
      skipped: false,
      result: null,
      idFaceB64: null,
    });
  }

  // ---------------------------------------------------------------
  // Client-side email gates — exact same rules as the backend, applied
  // before the API call so the user gets instant feedback.
  // ---------------------------------------------------------------
  static isRecruiterPublicDomain(email: string): boolean {
    return RECRUITER_BLOCKED_DOMAINS.has(domainOf(email) ?? '');
  }

  static isEspritStudentEmail(email: string): boolean {
    return domainOf(email) === ESPRIT_DOMAIN;
  }

  // ---------------------------------------------------------------
  // API calls — each one updates the state on success.
  // ---------------------------------------------------------------
  init(basic: BasicInfo): Observable<InitResponse> {
    return this.http.post<InitResponse>(`${this.base}/init`, basic).pipe(
      tap(resp => this.patch({
        basic,
        sessionId: resp.verificationSessionId,
        skipped: resp.verificationSkipped,
        // Short-circuit straight to the result if backend says we're done
        step: resp.verificationSkipped ? 'result' : 'documents',
      })),
    );
  }

  verifyDocuments(idFile: File, secondaryFile: File | null): Observable<DocumentVerifyResult> {
    const sessionId = this._state().sessionId;
    if (!sessionId) {
      throw new Error('No verification session — restart the signup.');
    }
    const fd = new FormData();
    fd.append('verificationSessionId', sessionId);
    fd.append('idFile', idFile);
    if (secondaryFile) fd.append('secondaryFile', secondaryFile);

    return this.http.post<DocumentVerifyResult>(
      `${this.base}/verify-documents`, fd
    ).pipe(
      tap(resp => this.patch({
        idFaceB64: resp.idFaceB64,
        step: 'face',
      })),
    );
  }

  verifyFace(frames: [File, File, File]): Observable<FaceVerifyResult> {
    const sessionId = this._state().sessionId;
    const idFaceB64 = this._state().idFaceB64;
    if (!sessionId || !idFaceB64) {
      throw new Error('Missing session or face reference — restart the signup.');
    }
    const fd = new FormData();
    fd.append('verificationSessionId', sessionId);
    fd.append('idFaceB64', idFaceB64);
    fd.append('frame1', frames[0]);
    fd.append('frame2', frames[1]);
    fd.append('frame3', frames[2]);

    return this.http.post<FaceVerifyResult>(
      `${this.base}/verify-face`, fd
    ).pipe(
      tap(result => this.patch({
        result,
        // Stay on the face step if it's retryable so the user can try again
        step: result.verdict === 'PASS' ? 'result'
            : result.verdict === 'FAIL' ? 'result'
            : 'face',
      })),
    );
  }

  // ---------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------
  private patch(p: Partial<WizardState>): void {
    const next = { ...this._state(), ...p };
    this._state.set(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage can fail in private modes; we just lose the resume capability
    }
  }

  private loadInitialState(): WizardState {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return this.emptyState();
      const parsed = JSON.parse(raw) as WizardState;
      if (parsed && typeof parsed === 'object' && 'step' in parsed) return parsed;
    } catch {
      // ignored — fall through to a fresh state
    }
    return this.emptyState();
  }

  private emptyState(): WizardState {
    return {
      step: 'role', role: null, basic: null,
      sessionId: null, idFaceB64: null,
      result: null, skipped: false,
    };
  }
}

function domainOf(email: string): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}
