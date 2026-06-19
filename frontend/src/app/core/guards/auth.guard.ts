import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigateByUrl('/login');
  return false;
};

/**
 * Blocks logged-in users from reaching public-only pages (login, signup
 * wizard, etc.) and bounces them to /feed instead.
 *
 * Carve-out: the signup wizard can also serve as the "resume my
 * identity verification" surface — after an admin requests it, the
 * profile page links to /signup/wizard?resume=identity. We let
 * authenticated users through whenever that query param is set so they
 * can finish the flow without logging out first.
 */
export const unauthGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  if (route.queryParamMap.get('resume') === 'identity') return true;
  router.navigateByUrl('/feed');
  return false;
};

export const roleGuard = (allowed: string[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (allowed.includes(auth.currentUser()?.role ?? '')) return true;
  router.navigateByUrl('/forbidden');
  return false;
};
