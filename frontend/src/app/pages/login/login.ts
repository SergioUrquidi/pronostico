import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

const COLD_START_SECS = 35;

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  username = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');
  countdown = signal(0);

  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private isRetry = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  async submit(): Promise<void> {
    this.clearTimers();
    this.isRetry = false;
    this.error.set('');
    this.countdown.set(0);
    this.loading.set(true);
    await this.doLogin();
  }

  private async doLogin(): Promise<void> {
    try {
      const user = await this.auth.login(this.username().trim().toLowerCase(), this.password());
      this.router.navigate([user.mustChangePassword ? '/cambiar-clave' : '/tabla']);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.loading.set(false);
        this.countdown.set(0);
        this.isRetry = false;
        this.error.set('Usuario o clave incorrectos');
      } else if (!this.isRetry) {
        this.isRetry = true;
        this.scheduleColdStartRetry();
      } else {
        this.loading.set(false);
        this.countdown.set(0);
        this.isRetry = false;
        this.error.set('El servidor no responde. Intentá de nuevo más tarde.');
      }
    }
  }

  private scheduleColdStartRetry(): void {
    this.countdown.set(COLD_START_SECS);
    this.countdownInterval = setInterval(() => {
      this.countdown.update(n => n - 1);
      if (this.countdown() <= 0) {
        clearInterval(this.countdownInterval!);
        this.countdownInterval = null;
      }
    }, 1000);
    this.retryTimeout = setTimeout(() => this.doLogin(), COLD_START_SECS * 1000);
  }

  private clearTimers(): void {
    if (this.retryTimeout) { clearTimeout(this.retryTimeout); this.retryTimeout = null; }
    if (this.countdownInterval) { clearInterval(this.countdownInterval); this.countdownInterval = null; }
  }
}
