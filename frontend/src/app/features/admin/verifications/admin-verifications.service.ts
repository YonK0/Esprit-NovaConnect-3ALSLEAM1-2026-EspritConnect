import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface LastAttemptSummary {
  step: string;
  outcome: string;
  nameMatchScore: number | null;
  faceMatchScore: number | null;
  livenessPassed: boolean | null;
  rejectionReason: string | null;
  completedAt: string | null;
  /** Short-lived presigned URL to the uploaded ID document (10 min TTL). */
  idFileUrl: string | null;
  /** Same, for the optional secondary document (degree / certificate / corporate proof). */
  secondaryFileUrl: string | null;
  /** Three captured frames from the face step. Empty when not a face attempt. */
  frameUrls: string[];
}

export interface PendingVerification {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: 'PENDING' | 'PENDING_APPROVAL' | 'VERIFICATION_FAILED' | 'DRAFT' | 'VERIFYING' | 'ACTIVE';
  attemptsCount: number;
  verifiedAt: string | null;
  signupAt: string;
  specialtyCode: string | null;
  promotionYear: number | null;
  identityVerified: boolean;
  identityVerificationRequestedAt: string | null;
  lastAttempt: LastAttemptSummary | null;
}

export interface VerificationDetail {
  user: PendingVerification;
  history: LastAttemptSummary[];
}

export interface Page<T> { content: T[]; totalElements: number; }

@Injectable({ providedIn: 'root' })
export class AdminVerificationsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin/verifications`;

  list(page = 0, size = 25): Observable<Page<PendingVerification>> {
    return this.http.get<Page<PendingVerification>>(
      `${this.base}?page=${page}&size=${size}`);
  }

  detail(userId: string): Observable<VerificationDetail> {
    return this.http.get<VerificationDetail>(`${this.base}/${userId}`);
  }

  approve(userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${userId}/approve`, {});
  }

  reject(userId: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${userId}/reject`, { reason });
  }

  acknowledge(userId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${userId}/acknowledge`, {});
  }
}
