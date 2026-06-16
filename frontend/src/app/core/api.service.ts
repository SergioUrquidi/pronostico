import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { Match, PredictionMap, ScoreboardEntry } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  getMatches(): Observable<Match[]> {
    return this.http.get<Match[]>(`${API_BASE_URL}/matches`);
  }

  getMyPredictions(): Observable<PredictionMap> {
    return this.http.get<PredictionMap>(`${API_BASE_URL}/predictions/me`);
  }

  getAllPredictions(): Observable<Record<string, Record<string, { displayName: string; home: number; away: number }>>> {
    return this.http.get<Record<string, Record<string, { displayName: string; home: number; away: number }>>>(
      `${API_BASE_URL}/predictions/all`
    );
  }

  savePrediction(matchId: string, home: number, away: number): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/predictions/${matchId}`, { home, away });
  }

  getScoreboard(): Observable<ScoreboardEntry[]> {
    return this.http.get<ScoreboardEntry[]>(`${API_BASE_URL}/scoreboard`);
  }

  adminSetResult(matchId: string, home: number, away: number): Observable<{ ok: true }> {
    return this.http.put<{ ok: true }>(`${API_BASE_URL}/admin/matches/${matchId}/result`, { home, away });
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
}
