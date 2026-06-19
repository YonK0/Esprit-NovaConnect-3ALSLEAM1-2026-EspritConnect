// Types mirror the backend Phase-1 DTOs. Kept narrow on purpose — anything
// we don't actively use stays off the wire shape so refactoring the backend
// doesn't immediately break Angular's strict template checks.

export type Role = 'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER';

export interface BasicInfo {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  promotionYear: number;
  specialtyCode: string;
  role: Role;
}

export interface InitResponse {
  userId: string;
  email: string;
  status: string;
  verificationSessionId: string;
  verificationSkipped: boolean;
  message: string;
}

export interface DocumentVerifyResult {
  verificationSessionId: string;
  nameOnId: string | null;
  nameOnSecondary: string | null;
  nameMatch: boolean;
  nameMatchScore: number;
  idFaceB64: string | null;
  message: string;
}

export interface FaceVerifyResult {
  verificationSessionId: string;
  faceMatch: boolean;
  similarity: number;
  framesPassing: number;
  livenessPassed: boolean;
  verdict: 'PASS' | 'RETRYABLE' | 'FAIL';
  attemptsRemaining: number;
  reasons: string[];
  message: string;
}

/** Steps in declaration order — the stepper renders them in this sequence. */
export type WizardStep = 'role' | 'basic' | 'documents' | 'face' | 'result';

export interface WizardState {
  step: WizardStep;
  role: Role | null;
  basic: BasicInfo | null;
  sessionId: string | null;
  idFaceB64: string | null;
  /** Last result, used by the result screen. */
  result: FaceVerifyResult | null;
  /** Set when init said the verification was short-circuited (esprit.tn student). */
  skipped: boolean;
}
