import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { GroupAdvanceMap, KNOCKOUT_PHASES, Match, PredictionMap } from '../../core/models';
import { kickoffToBolivia } from '../../core/utils';

const PHASES = ['Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final'];

@Component({
  selector: 'app-predict',
  imports: [FormsModule],
  templateUrl: './predict.html',
  styleUrl: './predict.scss',
})
export class Predict {
  private api = inject(ApiService);

  phases = PHASES;
  matches = signal<Match[]>([]);
  predictions = signal<PredictionMap>({});
  allPredictions = signal<Record<string, Record<string, { displayName: string; home: number; away: number }>>>({});
  groupAdvance = signal<GroupAdvanceMap>({});
  draft = signal<Record<string, { home: string; away: string; advance: string }>>({});
  changeCount = signal<Record<string, number>>({});
  viewMode = signal<'grupo' | 'fecha'>('grupo');
  selectedPhase = signal('Grupos');
  selectedGroup = signal('A');
  selectedDate = signal('');
  loading = signal(true);
  error = signal('');
  toast = signal('');

  isKnockout = (phase: string) => KNOCKOUT_PHASES.has(phase);

  groups = computed(() => {
    const set = new Set(
      this.matches()
        .filter((m) => m.phase === 'Grupos' && m.group)
        .map((m) => m.group as string)
    );
    return [...set].sort();
  });

  /** Teams available in the currently selected group (for group advance prediction) */
  teamsInGroup = computed(() => {
    const g = this.selectedGroup();
    const set = new Set<string>();
    for (const m of this.matches()) {
      if (m.phase === 'Grupos' && m.group === g) {
        if (m.home) set.add(m.home);
        if (m.away) set.add(m.away);
      }
    }
    return [...set].sort();
  });

  dates = computed(() => {
    const sorted = [...this.matches()].sort((a, b) => a.num - b.num);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of sorted) {
      if (m.dateLocal && !seen.has(m.dateLocal)) {
        seen.add(m.dateLocal);
        result.push(m.dateLocal);
      }
    }
    return result;
  });

  visibleMatches = computed(() => {
    const all = [...this.matches()].sort((a, b) => a.num - b.num);
    if (this.viewMode() === 'fecha') {
      const date = this.selectedDate() || this.dates()[0];
      return all.filter((m) => m.dateLocal === date);
    }
    const phase = this.selectedPhase();
    return all.filter((m) => m.phase === phase && (phase !== 'Grupos' || m.group === this.selectedGroup()));
  });

  private destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
    const interval = setInterval(() => this.load(true), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  private async load(silent = false): Promise<void> {
    if (!silent) { this.loading.set(true); this.error.set(''); }
    try {
      const [matches, predictions, groupAdvance, allPred] = await Promise.all([
        firstValueFrom(this.api.getMatches()),
        firstValueFrom(this.api.getMyPredictions()),
        firstValueFrom(this.api.getGroupAdvancePredictions()),
        firstValueFrom(this.api.getAllPredictions()),
      ]);
      this.matches.set(matches);
      this.predictions.set(predictions);
      this.groupAdvance.set(groupAdvance);
      this.allPredictions.set(allPred);
      if (!silent) {
        const draft: Record<string, { home: string; away: string; advance: string }> = {};
        for (const [matchId, pred] of Object.entries(predictions)) {
          draft[matchId] = {
            home: String(pred.home),
            away: String(pred.away),
            advance: pred.advance ?? '',
          };
        }
        this.draft.set(draft);
        if (this.dates().length) this.selectedDate.set(this.dates()[0]);
      }
    } catch {
      if (!silent) this.error.set('No se pudo cargar los pronósticos. Intentá de nuevo.');
    } finally {
      if (!silent) this.loading.set(false);
    }
  }

  flagUrl = flagUrl;
  kickoffToBolivia = kickoffToBolivia;

  isTimeLocked(match: Match): boolean {
    return match.locked;
  }

  isMatchSealedForBetting(match: Match): boolean {
    return this.isTimeLocked(match);
  }

  draftFor(matchId: string): { home: string; away: string; advance: string } {
    return this.draft()[matchId] ?? { home: '', away: '', advance: '' };
  }

  setDraftHome(matchId: string, value: string): void {
    this.draft.update((d) => ({ ...d, [matchId]: { ...this.draftFor(matchId), home: value } }));
  }

  setDraftAway(matchId: string, value: string): void {
    this.draft.update((d) => ({ ...d, [matchId]: { ...this.draftFor(matchId), away: value } }));
  }

  setDraftAdvance(matchId: string, value: string): void {
    this.draft.update((d) => ({ ...d, [matchId]: { ...this.draftFor(matchId), advance: value } }));
  }

  async saveAdvance(match: Match, value: string): Promise<void> {
    const current = this.draftFor(match.id).advance;
    this.setDraftAdvance(match.id, current === value ? '' : value);
    if (this.predictions()[match.id] !== undefined) {
      await this.save(match);
    }
  }

  saveBtnLabel(matchId: string): string {
    if (this.predictions()[matchId] === undefined) return 'Guardar';
    const count = this.changeCount()[matchId] ?? 0;
    return count > 0 ? `Editar (${count})` : 'Editar';
  }

  async save(match: Match): Promise<void> {
    const d = this.draftFor(match.id);
    const homeN = Number(d.home);
    const awayN = Number(d.away);
    if (d.home == null || d.away == null || d.home === '' || d.away === '') {
      this.showToast('Completá ambos scores para guardar');
      return;
    }
    if (!Number.isInteger(homeN) || !Number.isInteger(awayN) || homeN < 0 || awayN < 0) {
      this.showToast('Los scores deben ser números enteros positivos');
      return;
    }
    const alreadyExisted = this.predictions()[match.id] !== undefined;
    try {
      const advance = d.advance || null;
      await firstValueFrom(this.api.savePrediction(match.id, homeN, awayN, advance));
      this.predictions.update((p) => ({
        ...p,
        [match.id]: { home: homeN, away: awayN, advance: advance as 'home' | 'away' | null },
      }));
      if (alreadyExisted) {
        this.changeCount.update((c) => ({ ...c, [match.id]: (c[match.id] ?? 0) + 1 }));
      }
      const fresh = await firstValueFrom(this.api.getAllPredictions());
      this.allPredictions.set(fresh);
      this.showToast('Pronóstico guardado ✓');
    } catch (err: unknown) {
      const serverMsg = (err as { error?: { error?: string } })?.error?.error;
      this.showToast(serverMsg ?? 'No se pudo guardar');
    }
  }

  predictionsFor(matchId: string) {
    return Object.values(this.allPredictions()[matchId] ?? {});
  }

  /** Teams currently predicted to advance from the given group */
  groupAdvanceFor(group: string): string[] {
    return this.groupAdvance()[group] ?? [];
  }

  toggleGroupAdvanceTeam(group: string, team: string): void {
    const current = this.groupAdvanceFor(group);
    let next: string[];
    if (current.includes(team)) {
      next = current.filter((t) => t !== team);
    } else if (current.length < 2) {
      next = [...current, team];
    } else {
      // Replace the first one if already have 2
      next = [current[1], team];
    }
    this.groupAdvance.update((g) => ({ ...g, [group]: next }));
  }

  async saveGroupAdvance(group: string): Promise<void> {
    const teams = this.groupAdvanceFor(group);
    if (teams.length !== 2) {
      this.showToast('Seleccioná exactamente 2 equipos que avanzan');
      return;
    }
    try {
      await firstValueFrom(this.api.saveGroupAdvancePrediction(group, teams));
      this.showToast(`Grupo ${group}: avance guardado ✓`);
    } catch {
      this.showToast('No se pudo guardar el avance del grupo');
    }
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2200);
  }
}
