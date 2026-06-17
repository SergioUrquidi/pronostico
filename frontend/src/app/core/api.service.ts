import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { GroupAdvanceMap, Match, PredictionMap, ScoreboardEntry, StandingsByGroup } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  getMatches(): Observable<Match[]> {
    return this.http.get<Match[]>(`${API_BASE_URL}/matches`);
  }

  getMyPredictions(): Observable<PredictionMap> {
    return this.http.get<PredictionMap>(`${API_BASE_URL}/predictions/me`);
  }

  getAllPredictions(): Observable<Record<string, Record<string, { displayName: string; home: number; away: number; advance: string | null }>>> {
    return this.http.get<Record<string, Record<string, { displayName: string; home: number; away: number; advance: string | null }>>>(
      `${API_BASE_URL}/predictions/all`
    );
  }

  savePrediction(matchId: string, home: number, away: number, advance?: string | null): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/predictions/${matchId}`, { home, away, advance: advance ?? null });
  }

  getGroupAdvancePredictions(): Observable<GroupAdvanceMap> {
    return this.http.get<GroupAdvanceMap>(`${API_BASE_URL}/predictions/groups`);
  }

  saveGroupAdvancePrediction(group: string, teams: string[]): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/predictions/groups/${group}`, { teams });
  }

  getScoreboard(): Observable<ScoreboardEntry[]> {
    return this.http.get<ScoreboardEntry[]>(`${API_BASE_URL}/scoreboard`);
  }

  getStandings(): Observable<StandingsByGroup> {
    return this.http.get<StandingsByGroup>(`${API_BASE_URL}/standings`);
  }

  adminSetResult(matchId: string, home: number, away: number, advanceWinner?: string | null): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/admin/matches/${matchId}/result`, {
      home,
      away,
      advanceWinner: advanceWinner ?? null,
    });
  }

  adminSetTeams(matchId: string, home: string, away: string): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/admin/matches/${matchId}/teams`, { home, away });
  }

  adminGetConfig(): Observable<{ lockMinutesBeforeKickoff: number }> {
    return this.http.get<{ lockMinutesBeforeKickoff: number }>(`${API_BASE_URL}/admin/config`);
  }

  adminSetConfig(lockMinutesBeforeKickoff: number): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/admin/config`, { lockMinutesBeforeKickoff });
  }

  adminSeedHistorical(): Observable<{ ok: true; message: string }> {
    return this.http.post<{ ok: true; message: string }>(`${API_BASE_URL}/admin/seed-historical`, {});
  }

  adminSyncResults(): Observable<{ ok: true; lastSync: string | null }> {
    return this.http.post<{ ok: true; lastSync: string | null }>(`${API_BASE_URL}/admin/sync-results`, {});
  }

  adminGetSyncStatus(): Observable<{ lastSync: string | null; syncInProgress: boolean }> {
    return this.http.get<{ lastSync: string | null; syncInProgress: boolean }>(`${API_BASE_URL}/admin/sync-status`);
  }

  adminGetMatchPredictions(matchId: string): Observable<{ username: string; displayName: string; home: number | null; away: number | null; advance: string | null }[]> {
    return this.http.get<{ username: string; displayName: string; home: number | null; away: number | null; advance: string | null }[]>(
      `${API_BASE_URL}/admin/predictions/match/${matchId}`
    );
  }

  adminSetPrediction(matchId: string, username: string, home: number, away: number, advance?: string | null): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/admin/predictions/${matchId}/${username}`, {
      home,
      away,
      advance: advance ?? null,
    });
  }
}
