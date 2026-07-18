import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = signal('');
  password = signal('');
  loading = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      const user = await this.auth.login(this.username().trim().toLowerCase(), this.password());
      this.router.navigate([user.mustChangePassword ? '/cambiar-clave' : '/tabla']);
    } catch (err) {
      this.loading.set(false);
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.error.set('Usuario o clave incorrectos');
      } else {
        this.error.set('El servidor no responde. Intentá de nuevo más tarde.');
      }
    }
  }
}
