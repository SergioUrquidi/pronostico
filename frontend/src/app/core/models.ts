export interface AuthUser {
  username: string;
  displayName: string;
  role: 'player' | 'admin';
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface Match {
  id: string;
  num: number;
  phase: string;
  group: string | null;
  home: string | null;
  away: string | null;
  stadium: string;
  dateLocal: string;
  timeLocal: string;
  kickoffAtUtc: string;
  homeScore: number | null;
  awayScore: number | null;
  locked: boolean;
}

export interface PredictionMap {
  [matchId: string]: { home: number; away: number };
}

export interface ScoreboardEntry {
  username: string;
  displayName: string;
  points: number;
  exact: number;
  sign: number;
}
