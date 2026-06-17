const BOT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const BOT_OFFSET_MS = -4 * 60 * 60 * 1000; // Bolivia = UTC-4, sin horario de verano

/**
 * Convierte un timestamp UTC a fecha y hora en Bolivia (BOT = UTC-4).
 * Usa getUTC* para evitar que el browser aplique su propio offset.
 */
export function kickoffToBolivia(utcStr: string): { date: string; time: string } {
  const d = new Date(new Date(utcStr).getTime() + BOT_OFFSET_MS);
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${d.getUTCDate()} ${BOT_MONTHS[d.getUTCMonth()]}`,
    time: `${h}:${m}`,
  };
}
