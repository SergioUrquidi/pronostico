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
  advanceWinner: 'home' | 'away' | null;
  locked: boolean;
}

export interface PredictionEntry {
  home: number;
  away: number;
  advance: 'home' | 'away' | null;
}

export interface PredictionMap {
  [matchId: string]: PredictionEntry;
}

/** Groups advance predictions: group → array of 2 team names the user predicts will advance */
export interface GroupAdvanceMap {
  [group: string]: string[];
}

export interface ScoreboardEntry {
  username: string;
  displayName: string;
  points: number;
  exact: number;
  sign: number;
  advance: number;
  groupAdv: number;
}

export interface StandingsRow {
  team: string;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

export type StandingsByGroup = Record<string, StandingsRow[]>;

export const KNOCKOUT_PHASES = new Set([
  'Dieciseisavos',
  'Octavos',
  'Cuartos',
  'Semifinal',
  'TercerPuesto',
  'Final',
]);
