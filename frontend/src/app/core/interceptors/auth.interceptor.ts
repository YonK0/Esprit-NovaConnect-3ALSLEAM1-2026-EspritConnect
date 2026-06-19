import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenStorageService } from '../services/token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storage = inject(TokenStorageService);
  const access = storage.getAccess();
  
  // Public auth endpoints that don't need token
  const publicAuthEndpoints = [
    '/auth/signup',
    '/auth/login',
    '/auth/refresh',
    '/auth/verify-email',
    '/auth/resend-verification',
    '/auth/forgot-password',
    '/auth/reset-password'
  ];
  
  const isPublicEndpoint = publicAuthEndpoints.some(endpoint => req.url.includes(endpoint));
  
  if (access && !isPublicEndpoint) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${access}` } });
  }
  return next(req);
};
