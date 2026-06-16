import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagFor } from '../../core/flags';
import { Match, PredictionMap } from '../../core/models';

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
  draft = signal<Record<string, { home: string; away: string }>>({});
  viewMode = signal<'grupo' | 'fecha'>('grupo');
  selectedPhase = signal('Grupos');
  selectedGroup = signal('A');
  selectedDate = signal('');
  loading = signal(true);
  toast = signal('');

  groups = computed(() => {
    const set = new Set(
      this.matches()
        .filter((m) => m.phase === 'Grupos' && m.group)
        .map((m) => m.group as string)
    );
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
    const [matches, predictions] = await Promise.all([
      firstValueFrom(this.api.getMatches()),
      firstValueFrom(this.api.getMyPredictions()),
    ]);
    this.matches.set(matches);
    this.predictions.set(predictions);
    const draft: Record<string, { home: string; away: string }> = {};
    for (const [matchId, pred] of Object.entries(predictions)) {
      draft[matchId] = { home: String(pred.home), away: String(pred.away) };
    }
    this.draft.set(draft);
    if (this.dates().length) this.selectedDate.set(this.dates()[0]);
    this.loading.set(false);
  }

  flagFor = flagFor;

  draftFor(matchId: string): { home: string; away: string } {
    return this.draft()[matchId] ?? { home: '', away: '' };
  }

  setDraftHome(matchId: string, value: string): void {
    this.draft.update((d) => ({ ...d, [matchId]: { ...this.draftFor(matchId), home: value } }));
  }

  setDraftAway(matchId: string, value: string): void {
    this.draft.update((d) => ({ ...d, [matchId]: { ...this.draftFor(matchId), away: value } }));
  }

  async save(match: Match): Promise<void> {
    const d = this.draftFor(match.id);
    if (d.home === '' || d.away === '') return;
    try {
      await firstValueFrom(this.api.savePrediction(match.id, Number(d.home), Number(d.away)));
      this.predictions.update((p) => ({ ...p, [match.id]: { home: Number(d.home), away: Number(d.away) } }));
      this.showToast('Pronóstico guardado');
    } catch {
      this.showToast('No se pudo guardar (¿partido bloqueado?)');
    }
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2200);
  }
}
