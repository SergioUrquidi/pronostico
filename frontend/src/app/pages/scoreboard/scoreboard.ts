import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { flagFor } from '../../core/flags';
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
  medals = MEDALS;

  groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const [board, standings] = await Promise.all([
      firstValueFrom(this.api.getScoreboard()),
      firstValueFrom(this.api.getStandings()),
    ]);
    this.board.set(board);
    this.standings.set(standings);
    this.loading.set(false);
  }

  flagFor = flagFor;

  rowsFor(group: string) {
    return this.standings()[group] ?? [];
  }
}
