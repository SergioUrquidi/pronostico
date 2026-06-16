import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { AuthUser, LoginResponse } from './models';

const TOKEN_KEY = 'pronostico_token';
const USER_KEY = 'pronostico_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private userSignal = signal<AuthUser | null>(this.readStoredUser());

  token = computed(() => this.tokenSignal());
  user = computed(() => this.userSignal());
  isLoggedIn = computed(() => !!this.tokenSignal());
  isAdmin = computed(() => this.userSignal()?.role === 'admin');
  mustChangePassword = computed(() => this.userSignal()?.mustChangePassword ?? false);

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  }

  private persist(token: string, user: AuthUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.tokenSignal.set(token);
    this.userSignal.set(user);
  }

  async login(username: string, password: string): Promise<AuthUser> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/auth/login`, { username, password })
    );
    this.persist(res.token, res.user);
    return res.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<{ token: string }>(`${API_BASE_URL}/auth/change-password`, {
        currentPassword,
        newPassword,
      })
    );
    const current = this.userSignal();
    if (current) this.persist(res.token, { ...current, mustChangePassword: false });
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }
}
