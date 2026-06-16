import { Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ScoreboardEntry } from '../../core/models';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];

@Component({
  selector: 'app-scoreboard',
  imports: [],
  templateUrl: './scoreboard.html',
  styleUrl: './scoreboard.scss',
})
export class Scoreboard {
  private api = inject(ApiService);

  board = signal<ScoreboardEntry[]>([]);
  loading = signal(true);
  medals = MEDALS;

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.board.set(await firstValueFrom(this.api.getScoreboard()));
    this.loading.set(false);
  }
}
