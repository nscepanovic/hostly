import type { DurationRule } from './schemas';

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHhmm(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Picks the duration for a party size from rules sorted by `upToCovers`; falls back to `fallback`. */
export function durationForCovers(rules: DurationRule[], covers: number, fallback: number): number {
  const sorted = [...rules].sort((a, b) => a.upToCovers - b.upToCovers);
  return sorted.find((r) => covers <= r.upToCovers)?.minutes ?? fallback;
}
