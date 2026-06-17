import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { KNOCKOUT_PHASES, Match } from '../../core/models';

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
  error = signal('');
  toast = signal('');
  flagUrl = flagUrl;
  /** advance winner draft per match id: '' | 'home' | 'away' */
  advDraft = signal<Record<string, string>>({});

  isKnockout = (phase: string) => KNOCKOUT_PHASES.has(phase);

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
    this.error.set('');
    try {
      const [matches, config] = await Promise.all([
        firstValueFrom(this.api.getMatches()),
        firstValueFrom(this.api.adminGetConfig()),
      ]);
      this.matches.set(matches);
      this.lockMinutes.set(config.lockMinutesBeforeKickoff);
      // Prefill advance draft from existing data
      const draft: Record<string, string> = {};
      for (const m of matches) {
        if (KNOCKOUT_PHASES.has(m.phase)) draft[m.id] = m.advanceWinner ?? '';
      }
      this.advDraft.set(draft);
    } catch {
      this.error.set('No se pudo cargar los datos. Intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async saveTeams(match: Match, home: string, away: string): Promise<void> {
    if (!home.trim() || !away.trim()) return;
    try {
      await firstValueFrom(this.api.adminSetTeams(match.id, home.trim(), away.trim()));
      this.matches.update((all) =>
        all.map((m) => (m.id === match.id ? { ...m, home: home.trim().toUpperCase(), away: away.trim().toUpperCase() } : m))
      );
      this.showToast('Equipos actualizados ✓');
    } catch {
      this.showToast('Error al guardar equipos');
    }
  }

  advDraftFor(matchId: string): string {
    return this.advDraft()[matchId] ?? '';
  }

  setAdvDraft(matchId: string, value: string): void {
    this.advDraft.update((d) => ({ ...d, [matchId]: value }));
  }

  async saveResult(match: Match, home: string, away: string): Promise<void> {
    if (home === '' || away === '') return;
    const homeN = Number(home);
    const awayN = Number(away);
    const advanceWinner = this.advDraftFor(match.id);
    // Require advance_winner for knockout draws (penalties)
    if (KNOCKOUT_PHASES.has(match.phase) && homeN === awayN && !advanceWinner) {
      this.showToast('Empate en knockout: indicá quién avanzó (penales)');
      return;
    }
    try {
      const aw = advanceWinner === 'home' || advanceWinner === 'away' ? advanceWinner : null;
      await firstValueFrom(this.api.adminSetResult(match.id, homeN, awayN, aw));
      this.matches.update((all) =>
        all.map((m) =>
          m.id === match.id
            ? { ...m, homeScore: homeN, awayScore: awayN, advanceWinner: aw as 'home' | 'away' | null }
            : m
        )
      );
      this.showToast('Resultado guardado ✓');
    } catch {
      this.showToast('Error al guardar resultado');
    }
  }

  async saveLockMinutes(): Promise<void> {
    try {
      await firstValueFrom(this.api.adminSetConfig(this.lockMinutes()));
      this.showToast('Configuración actualizada ✓');
    } catch {
      this.showToast('Error al guardar configuración');
    }
  }

  seedLoading = signal(false);

  async seedHistorical(): Promise<void> {
    if (!confirm('¿Importar datos históricos de la planilla? Esto sobreescribirá los resultados y pronósticos existentes.')) return;
    this.seedLoading.set(true);
    try {
      const res = await firstValueFrom(this.api.adminSeedHistorical());
      this.showToast(res.message);
      await this.load();
    } catch {
      this.showToast('Error al importar datos históricos');
    } finally {
      this.seedLoading.set(false);
    }
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
