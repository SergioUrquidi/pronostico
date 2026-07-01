import { Component, DestroyRef, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagUrl } from '../../core/flags';
import { ScoreboardEntry, StandingsByGroup } from '../../core/models';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

@Component({
  selector: 'app-scoreboard',
  imports: [],
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.scss',
})
export class Scoreboard {
  private api = inject(ApiService);

  view = signal<'jugadores' | 'grupos'>('jugadores');

  board = signal<ScoreboardEntry[]>([]);
  standings = signal<StandingsByGroup>({});
  selectedGroup = signal('A');
  loading = signal(true);
  error = signal('');
  medals = MEDALS;

  groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  private destroyRef = inject(DestroyRef);

  constructor() {
    this.load();
    const interval = setInterval(() => this.load(true), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  private async load(silent = false): Promise<void> {
    if (!silent) { this.loading.set(true); this.error.set(''); }
    try {
      const [board, standings] = await Promise.all([
        firstValueFrom(this.api.getScoreboard()),
        firstValueFrom(this.api.getStandings()),
      ]);
      this.board.set(board);
      this.standings.set(standings);
      this.error.set('');
    } catch {
      if (!silent) this.error.set('No se pudo cargar la tabla. Intentá de nuevo.');
    } finally {
      if (!silent) this.loading.set(false);
    }
  }

  flagUrl = flagUrl;

  rowsFor(group: string) {
    return this.standings()[group] ?? [];
  }
}
