import {
  HttpInterceptorFn, HttpErrorResponse, HttpClient, HttpContextToken
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { TokenStorageService } from '../services/token-storage.service';
import { environment } from '../../../environments/environment';

interface RefreshResponse { accessToken: string | null; refreshToken: string | null; }

/** Marks a request that has already been retried after a token refresh, so a
 *  second 401 can't trigger an infinite refresh loop. */
const RETRIED = new HttpContextToken<boolean>(() => false);

/** Shared across all requests: concurrent 401s wait on ONE refresh call so we
 *  don't fire multiple refreshes (the backend rotates the refresh token, so a
 *  second concurrent refresh would use an already-revoked token and fail). */
let refreshInFlight: Observable<string> | null = null;

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const storage = inject(TokenStorageService);
  const http = inject(HttpClient);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/auth/');
      const alreadyRetried = req.context.get(RETRIED);

      // Access token expired → silently refresh and retry, instead of logging out.
      if (err.status === 401 && !isAuthCall && !alreadyRetried) {
        const refreshToken = storage.getRefresh();
        if (!refreshToken) {
          storage.clear();
          router.navigateByUrl('/login');
          return throwError(() => err);
        }

        if (!refreshInFlight) {
          refreshInFlight = http.post<RefreshResponse>(
            `${environment.apiUrl}/auth/refresh`, { refreshToken }
          ).pipe(
            map(r => {
              if (r.accessToken && r.refreshToken) {
                storage.saveTokens(r.accessToken, r.refreshToken);
              }
              return r.accessToken ?? '';
            }),
            tap({ next: () => { refreshInFlight = null; },
                  error: () => { refreshInFlight = null; } }),
            shareReplay(1)
          );
        }

        return refreshInFlight.pipe(
          switchMap(newAccess => {
            if (!newAccess) {
              storage.clear();
              router.navigateByUrl('/login');
              return throwError(() => err);
            }
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${newAccess}` },
              context: req.context.set(RETRIED, true)
            });
            return next(retried);
          }),
          catchError(() => {
            // Refresh failed (token revoked/expired) → genuine logout.
            storage.clear();
            router.navigateByUrl('/login');
            return throwError(() => err);
          })
        );
      }

      // A 401 on a retried request (refresh didn't help) → log out.
      if (err.status === 401 && !isAuthCall && alreadyRetried) {
        storage.clear();
        router.navigateByUrl('/login');
      }

      // Only redirect on a 403 from a GET (page-load denial), not from
      // action verbs — those should bubble to the component so the user
      // sees a contextual toast and doesn't lose their unsaved input.
      if (err.status === 403 && req.method === 'GET' && !req.url.includes('/admin/')) {
        router.navigateByUrl('/forbidden');
      }
      return throwError(() => err);
    })
  );
};
