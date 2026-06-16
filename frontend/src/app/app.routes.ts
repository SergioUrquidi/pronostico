import { Routes } from '@angular/router';
import { adminGuard, authGuard, changePasswordGuard } from './core/guards';
import { ChangePassword } from './pages/change-password/change-password';
import { Login } from './pages/login/login';
import { Shell } from './shared/shell/shell';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: 'cambiar-clave', component: ChangePassword, canActivate: [changePasswordGuard] },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'tabla', pathMatch: 'full' },
      {
        path: 'predicciones',
        loadComponent: () => import('./pages/predict/predict').then((m) => m.Predict),
      },
      {
        path: 'partidos',
        loadComponent: () => import('./pages/matches/matches').then((m) => m.Matches),
      },
      {
        path: 'tabla',
        loadComponent: () => import('./pages/scoreboard/scoreboard').then((m) => m.Scoreboard),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
