import { Injectable } from '@angular/core';

const ACCESS_KEY = 'ec.access';
const REFRESH_KEY = 'ec.refresh';
const USER_KEY = 'ec.user';

export interface StoredUser {
  userId: string;
  email: string;
  role: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  saveTokens(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }

  saveUser(u: StoredUser): void {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }

  getAccess(): string | null { return localStorage.getItem(ACCESS_KEY); }
  getRefresh(): string | null { return localStorage.getItem(REFRESH_KEY); }
  getUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) as StoredUser : null;
  }

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  }
}
