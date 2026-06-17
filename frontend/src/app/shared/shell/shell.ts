import { Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { API_BASE_URL } from '../../core/api-config';

const HEALTH_URL = API_BASE_URL.replace('/api', '') + '/health';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  auth = inject(AuthService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  constructor() {
    const interval = setInterval(() => fetch(HEALTH_URL).catch(() => {}), 4 * 60 * 1000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
