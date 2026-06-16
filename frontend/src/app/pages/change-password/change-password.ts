import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-change-password',
  imports: [FormsModule],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss',
})
export class ChangePassword {
  private auth = inject(AuthService);
  private router = inject(Router);

  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  loading = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    if (this.newPassword().length < 4) {
      this.error.set('La nueva clave debe tener al menos 4 caracteres');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.error.set('Las claves no coinciden');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.changePassword(this.currentPassword(), this.newPassword());
      this.router.navigate(['/tabla']);
    } catch {
      this.error.set('Clave actual incorrecta');
    } finally {
      this.loading.set(false);
    }
  }
}
