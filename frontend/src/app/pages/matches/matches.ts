import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { Match } from '../../core/models';
import { kickoffToBolivia } from '../../core/utils';

const PHASES = ['Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final'];

type AllPredictions = Record<string, Record<string, { displayName: string; home: number; away: number; advance: string | null }>>;

const KNOCKOUT_PHASES = new Set(['Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final']);

@Component({
  selector: 'app-matches',
  imports: [],
  templateUrl: './matches.html',
  styleUrl: './matches.scss',
})
export class Matches {
  private api = inject(ApiService);

  phases = PHASES;
  matches = signal<Match[]>([]);
  allPredictions = signal<AllPredictions>({});
  selectedPhase = signal('Grupos');
  selectedGroup = signal('A');
  loading = signal(true);
  error = signal('');

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

  private destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
    const interval = setInterval(() => this.load(true), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  private async load(silent = false): Promise<void> {
    if (!silent) { this.loading.set(true); this.error.set(''); }
    try {
      const [matches, predictions] = await Promise.all([
        firstValueFrom(this.api.getMatches()),
        firstValueFrom(this.api.getAllPredictions()),
      ]);
      this.matches.set(matches);
      this.allPredictions.set(predictions);
    } catch {
      if (!silent) this.error.set('No se pudo cargar los partidos. Intentá de nuevo.');
    } finally {
      if (!silent) this.loading.set(false);
    }
  }

  flagUrl = flagUrl;
  kickoffToBolivia = kickoffToBolivia;

  isPredictionVisible(_match: Match): boolean {
    return true;
  }

  isKnockout(phase: string): boolean {
    return KNOCKOUT_PHASES.has(phase);
  }

  predictionsFor(matchId: string) {
    return Object.values(this.allPredictions()[matchId] ?? {});
  }
}
