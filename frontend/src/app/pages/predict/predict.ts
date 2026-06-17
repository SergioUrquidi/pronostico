import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { GroupAdvanceMap, KNOCKOUT_PHASES, Match, PredictionMap } from '../../core/models';

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
  groupAdvance = signal<GroupAdvanceMap>({});
  draft = signal<Record<string, { home: string; away: string; advance: string }>>({});
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

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [matches, predictions, groupAdvance] = await Promise.all([
        firstValueFrom(this.api.getMatches()),
        firstValueFrom(this.api.getMyPredictions()),
        firstValueFrom(this.api.getGroupAdvancePredictions()),
      ]);
      this.matches.set(matches);
      this.predictions.set(predictions);
      this.groupAdvance.set(groupAdvance);
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
    } catch {
      this.error.set('No se pudo cargar los pronósticos. Intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  flagUrl = flagUrl;

  isMatchSealedForBetting(match: Match): boolean {
    if (match.locked) return true;
    const kickoff = new Date(match.kickoffAtUtc).getTime();
    return Date.now() >= kickoff - 60 * 60 * 1000;
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

  async save(match: Match): Promise<void> {
    const d = this.draftFor(match.id);
    if (d.home === '' || d.away === '') return;
    try {
      const advance = d.advance || null;
      await firstValueFrom(this.api.savePrediction(match.id, Number(d.home), Number(d.away), advance));
      this.predictions.update((p) => ({
        ...p,
        [match.id]: { home: Number(d.home), away: Number(d.away), advance: advance as 'home' | 'away' | null },
      }));
      this.showToast('Pronóstico guardado ✓');
    } catch {
      this.showToast('No se pudo guardar (¿partido bloqueado?)');
    }
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
