import { SIM_TICK_RATE } from "@racing/shared";

/** 83456 → « 1:23.456 ». null (pas fini) → « DNF ». */
export function formatRaceTime(ms: number | null): string {
  if (ms === null) return "DNF";
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** Pas de simulation restants → secondes entières, arrondies au-dessus (3, 2, 1...). */
export function ticksToSeconds(ticks: number | null): number {
  return ticks === null ? 0 : Math.ceil(ticks / SIM_TICK_RATE);
}

/** 1 → « 1er », 2 → « 2e »... */
export function ordinal(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}
