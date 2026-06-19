import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService, StoredUser } from './token-storage.service';

export interface AuthResponse {
  userId: string;
  email: string;
  role: string;
  status: string;
  accessToken: string | null;
  refreshToken: string | null;
}

export interface LoginPayload { email: string; password: string; }
export type Role = 'STUDENT' | 'ALUMNI' | 'MENTOR' | 'RECRUITER';
export interface SignupPayload {
  email: string; password: string;
  firstName: string; lastName: string;
  country: string;
  promotionYears: number[]; specialtyCode: string;
  role: Role;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private storage = inject(TokenStorageService);

  currentUser = signal<StoredUser | null>(this.storage.getUser());

  login(p: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, p).pipe(
      tap(r => this.handleAuthSuccess(r))
    );
  }

  signup(p: SignupPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/signup`, p);
  }

  refresh(refreshToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/refresh`,
      { refreshToken }).pipe(tap(r => this.handleAuthSuccess(r)));
  }

  logout(): void {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
      complete: () => this.clearAndRedirect(),
      error: () => this.clearAndRedirect()
    });
  }

  /**
   * Confirms a user's email with the 6-digit OTP and receives the
   * identity-verification session id used by the inline KYC steps.
   * The verify-email screen drives that flow directly so it builds its
   * own typed HTTP call; this method exists for back-compat callers
   * (login screen "resend a code" affordance, tests) and treats the
   * response as opaque.
   */
  verifyEmail(email: string, code: string): Observable<unknown> {
    return this.http.post<unknown>(`${environment.apiUrl}/auth/verify-email`,
      { email, code });
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post<void>(`${environment.apiUrl}/auth/resend-verification`,
      null, { params: { email } });
  }

  /**
   * Requests a password reset for a user by email.
   * Backend sends a reset token to the email address.
   */
  requestPasswordReset(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/auth/forgot-password`,
      { email }
    );
  }

  /**
   * Confirms password reset with token and new password.
   */
  confirmPasswordReset(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/auth/reset-password`,
      { token, newPassword }
    );
  }

  isAuthenticated(): boolean {
    return !!this.storage.getAccess();
  }

  hasRole(role: string): boolean {
    return this.currentUser()?.role === role;
  }

  private handleAuthSuccess(r: AuthResponse): void {
    if (r.accessToken && r.refreshToken) {
      this.storage.saveTokens(r.accessToken, r.refreshToken);
    }
    const u: StoredUser = { userId: r.userId, email: r.email, role: r.role, status: r.status };
    this.storage.saveUser(u);
    this.currentUser.set(u);
  }

  private clearAndRedirect(): void {
    this.storage.clear();
    this.currentUser.set(null);
    this.router.navigateByUrl('/login');
  }
}
