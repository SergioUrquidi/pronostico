import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { Match } from '../../core/models';

const PHASES = ['Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'TercerPuesto', 'Final'];

type AllPredictions = Record<string, Record<string, { displayName: string; home: number; away: number }>>;

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

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [matches, predictions] = await Promise.all([
        firstValueFrom(this.api.getMatches()),
        firstValueFrom(this.api.getAllPredictions()),
      ]);
      this.matches.set(matches);
      this.allPredictions.set(predictions);
    } catch {
      this.error.set('No se pudo cargar los partidos. Intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  flagUrl = flagUrl;

  predictionsFor(matchId: string) {
    return Object.values(this.allPredictions()[matchId] ?? {});
  }
}
