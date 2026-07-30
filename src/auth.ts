const AUTH_KEY = 'financetracker_auth';

export const ALLOWED_EMAILS = ['chanaranga@gmail.com', 'umeaha.alwis@gmail.com'];

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  token: string; // Google ID token — sent as Bearer on every API request
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: AuthUser): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(AUTH_KEY);
}
