import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { Match } from '../../core/models';

const PHASES = ['Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final'];

@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  private api = inject(ApiService);

  phases = PHASES;
  matches = signal<Match[]>([]);
  selectedPhase = signal('Grupos');
  selectedGroup = signal('A');
  lockMinutes = signal(60);
  loading = signal(true);
  toast = signal('');
  flagUrl = flagUrl;

  groups = computed(() => {
    const set = new Set(
      this.matches()
        .filter((m) => m.phase === 'Grupos' && m.group)
        .map((m) => m.group as string)
    );
    return [...set].sort();
  });

  visibleMatches = computed(() => {
    const phase = this.selectedPhase();
    return this.matches()
      .filter((m) => m.phase === phase && (phase !== 'Grupos' || m.group === this.selectedGroup()))
      .sort((a, b) => a.num - b.num);
  });

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const [matches, config] = await Promise.all([
      firstValueFrom(this.api.getMatches()),
      firstValueFrom(this.api.adminGetConfig()),
    ]);
    this.matches.set(matches);
    this.lockMinutes.set(config.lockMinutesBeforeKickoff);
    this.loading.set(false);
  }

  async saveTeams(match: Match, home: string, away: string): Promise<void> {
    if (!home.trim() || !away.trim()) return;
    await firstValueFrom(this.api.adminSetTeams(match.id, home.trim(), away.trim()));
    this.matches.update((all) =>
      all.map((m) => (m.id === match.id ? { ...m, home: home.trim().toUpperCase(), away: away.trim().toUpperCase() } : m))
    );
    this.showToast('Equipos actualizados');
  }

  async saveResult(match: Match, home: string, away: string): Promise<void> {
    if (home === '' || away === '') return;
    await firstValueFrom(this.api.adminSetResult(match.id, Number(home), Number(away)));
    this.matches.update((all) =>
      all.map((m) => (m.id === match.id ? { ...m, homeScore: Number(home), awayScore: Number(away) } : m))
    );
    this.showToast('Resultado guardado');
  }

  async saveLockMinutes(): Promise<void> {
    await firstValueFrom(this.api.adminSetConfig(this.lockMinutes()));
    this.showToast('Configuración de bloqueo actualizada');
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2200);
  }
}
