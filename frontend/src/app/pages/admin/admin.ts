import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { KNOCKOUT_PHASES, Match } from '../../core/models';
import { kickoffToBolivia } from '../../core/utils';

const PHASES = ['Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final'];

@Component({
  selector: 'app-admin',
  imports: [FormsModule, DatePipe],
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
  kickoffToBolivia = kickoffToBolivia;
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

  async clearResult(match: Match): Promise<void> {
    if (!confirm(`¿Borrar resultado de ${match.home} vs ${match.away}?`)) return;
    try {
      await firstValueFrom(this.api.adminSetResult(match.id, null as unknown as number, null as unknown as number, null));
      this.matches.update((all) =>
        all.map((m) => m.id === match.id ? { ...m, homeScore: null, awayScore: null, advanceWinner: null } : m)
      );
      this.showToast('Resultado borrado ✓');
    } catch {
      this.showToast('Error al borrar resultado');
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

  playerView = signal(false);
  selectedPlayer = signal('');
  playerPredictions = signal<{ matchId: string; home: string; away: string; dateLocal: string; timeLocal: string; phase: string; group: string | null; homePred: number; awayPred: number }[]>([]);
  playerPredDraft = signal<Record<string, { home: string; away: string }>>({});
  players = ['marco', 'sergio', 'cesar', 'rimmy', 'jonathan', 'christian'];
  playerNames: Record<string, string> = { marco:'Marco', sergio:'Sergio', cesar:'César', rimmy:'Rimmy', jonathan:'Jonathan', christian:'Christian' };
  playerLoading = signal(false);

  // Predictions editor per match
  expandedMatch = signal<string | null>(null);
  matchPredictions = signal<Record<string, { username: string; displayName: string; home: number | null; away: number | null; advance: string | null }[]>>({});
  predDraft = signal<Record<string, { home: string; away: string }>>({});

  async togglePredictions(matchId: string): Promise<void> {
    if (this.expandedMatch() === matchId) {
      this.expandedMatch.set(null);
      return;
    }
    this.expandedMatch.set(matchId);
    if (this.matchPredictions()[matchId]) return; // already loaded
    try {
      const preds = await firstValueFrom(this.api.adminGetMatchPredictions(matchId));
      this.matchPredictions.update((mp) => ({ ...mp, [matchId]: preds }));
      const draft: Record<string, { home: string; away: string }> = {};
      for (const p of preds) {
        draft[`${matchId}_${p.username}`] = {
          home: p.home !== null ? String(p.home) : '',
          away: p.away !== null ? String(p.away) : '',
        };
      }
      this.predDraft.update((d) => ({ ...d, ...draft }));
    } catch {
      this.showToast('No se pudo cargar los pronósticos');
    }
  }

  predDraftFor(matchId: string, username: string): { home: string; away: string } {
    return this.predDraft()[`${matchId}_${username}`] ?? { home: '', away: '' };
  }

  setPredDraftHome(matchId: string, username: string, value: string): void {
    const key = `${matchId}_${username}`;
    this.predDraft.update((d) => ({ ...d, [key]: { ...d[key] ?? { home: '', away: '' }, home: value } }));
  }

  setPredDraftAway(matchId: string, username: string, value: string): void {
    const key = `${matchId}_${username}`;
    this.predDraft.update((d) => ({ ...d, [key]: { ...d[key] ?? { home: '', away: '' }, away: value } }));
  }

  async savePlayerPrediction(matchId: string, username: string): Promise<void> {
    const d = this.predDraftFor(matchId, username);
    if (d.home === '' || d.away === '') { this.showToast('Completá ambos goles'); return; }
    try {
      await firstValueFrom(this.api.adminSetPrediction(matchId, username, Number(d.home), Number(d.away)));
      // Update local cache
      this.matchPredictions.update((mp) => ({
        ...mp,
        [matchId]: (mp[matchId] ?? []).map((p) =>
          p.username === username ? { ...p, home: Number(d.home), away: Number(d.away) } : p
        ),
      }));
      this.showToast(`Pronóstico de ${username} guardado ✓`);
    } catch {
      this.showToast('Error al guardar el pronóstico');
    }
  }

  predictionsFor(matchId: string) {
    return this.matchPredictions()[matchId] ?? [];
  }

  async loadPlayerPredictions(username: string): Promise<void> {
    this.selectedPlayer.set(username);
    this.playerLoading.set(true);
    try {
      const res = await firstValueFrom(this.api.adminGetPlayerPredictions(username));
      this.playerPredictions.set(res.predictions);
      const draft: Record<string, { home: string; away: string }> = {};
      for (const p of res.predictions) {
        draft[p.matchId] = { home: String(p.homePred), away: String(p.awayPred) };
      }
      this.playerPredDraft.set(draft);
    } catch {
      this.showToast('No se pudo cargar las predicciones del jugador');
    } finally {
      this.playerLoading.set(false);
    }
  }

  playerPredDraftFor(matchId: string): { home: string; away: string } {
    return this.playerPredDraft()[matchId] ?? { home: '', away: '' };
  }

  setPlayerPredDraftHome(matchId: string, value: string): void {
    this.playerPredDraft.update(d => ({ ...d, [matchId]: { ...d[matchId] ?? { home: '', away: '' }, home: value } }));
  }

  setPlayerPredDraftAway(matchId: string, value: string): void {
    this.playerPredDraft.update(d => ({ ...d, [matchId]: { ...d[matchId] ?? { home: '', away: '' }, away: value } }));
  }

  async savePlayerPredFromView(matchId: string): Promise<void> {
    const d = this.playerPredDraftFor(matchId);
    if (d.home === '' || d.away === '') { this.showToast('Completá ambos goles'); return; }
    try {
      await firstValueFrom(this.api.adminSetPrediction(matchId, this.selectedPlayer(), Number(d.home), Number(d.away)));
      this.playerPredictions.update(preds =>
        preds.map(p => p.matchId === matchId ? { ...p, homePred: Number(d.home), awayPred: Number(d.away) } : p)
      );
      this.showToast('Pronóstico guardado ✓');
    } catch {
      this.showToast('Error al guardar');
    }
  }

  syncLoading = signal(false);
  lastSync = signal<string | null>(null);

  async syncResults(): Promise<void> {
    this.syncLoading.set(true);
    try {
      const res = await firstValueFrom(this.api.adminSyncResults());
      this.lastSync.set(res.lastSync);
      this.showToast('Resultados sincronizados desde worldcup26.ir ✓');
      await this.load();
    } catch {
      this.showToast('Error al sincronizar resultados');
    } finally {
      this.syncLoading.set(false);
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
