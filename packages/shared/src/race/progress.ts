import type { CarState } from "../sim/car";
import type { Gate, Track } from "../tracks/track";

/** Marge latérale (m) : une porte compte un peu au-delà des bords, la voiture a une largeur. */
const GATE_LATERAL_MARGIN = 2;

/** Où en est un joueur dans la course. Uniquement des nombres : facile à envoyer et à tester. */
export interface RaceProgress {
  /** Tours terminés. */
  lapsCompleted: number;
  /** Index de la prochaine porte à franchir (0 = ligne d'arrivée). */
  nextGate: number;
  /** Nombre total de portes franchies depuis le départ (sert au classement). */
  gatesPassed: number;
  /** Pas de simulation (tick) où le joueur a fini, ou null. */
  finishTick: number | null;
}

export function createProgress(): RaceProgress {
  return { lapsCompleted: 0, nextGate: 0, gatesPassed: 0, finishTick: null };
}

/**
 * La voiture a-t-elle franchi la porte, dans le sens de la course, entre `from` et `to` ?
 * On regarde de quel côté de la ligne se trouve chaque position (signe du produit scalaire
 * avec la direction de course) : passer de « derrière » (< 0) à « devant » (≥ 0) = franchir.
 */
export function crossedGate(gate: Gate, from: CarState, to: CarState, halfWidth: number): boolean {
  const before = (from.x - gate.x) * gate.tx + (from.z - gate.z) * gate.tz;
  const after = (to.x - gate.x) * gate.tx + (to.z - gate.z) * gate.tz;
  if (!(before < 0 && after >= 0)) return false;
  // La ligne est infinie : on vérifie qu'on la traverse bien SUR la piste (distance latérale),
  // sinon une autre partie du circuit qui passe à côté compterait aussi.
  const lateral = Math.abs(-(to.x - gate.x) * gate.tz + (to.z - gate.z) * gate.tx);
  return lateral <= halfWidth + GATE_LATERAL_MARGIN;
}

/**
 * Met à jour la progression après un pas de simulation (fonction pure).
 * Seule la PROCHAINE porte compte : impossible de sauter une partie du circuit,
 * et faire des allers-retours sur la ligne d'arrivée ne rapporte rien.
 */
export function updateProgress(
  progress: RaceProgress,
  from: CarState,
  to: CarState,
  track: Track,
  totalLaps: number,
  tick: number,
): RaceProgress {
  if (progress.finishTick !== null) return progress;
  const gate = track.gates[progress.nextGate];
  if (!gate || !crossedGate(gate, from, to, track.halfWidth)) return progress;

  // Franchir la ligne d'arrivée termine un tour, sauf la toute première fois
  // (on part de derrière la ligne : ce passage-là lance le premier tour).
  const completesLap = progress.nextGate === 0 && progress.gatesPassed > 0;
  const lapsCompleted = progress.lapsCompleted + (completesLap ? 1 : 0);
  return {
    lapsCompleted,
    nextGate: (progress.nextGate + 1) % track.gates.length,
    gatesPassed: progress.gatesPassed + 1,
    finishTick: lapsCompleted >= totalLaps ? tick : null,
  };
}

/** Tour affiché au joueur (1 à totalLaps). */
export function currentLap(progress: RaceProgress, totalLaps: number): number {
  return Math.min(progress.lapsCompleted + 1, totalLaps);
}

export interface RankEntry {
  id: string;
  car: CarState;
  progress: RaceProgress;
}

/**
 * Classement, du premier au dernier :
 * 1. ceux qui ont fini, par ordre d'arrivée ;
 * 2. puis le plus de portes franchies ;
 * 3. à égalité, le plus proche de sa prochaine porte ;
 * 4. en dernier recours l'identifiant, pour un ordre stable.
 */
export function rankCars(entries: ReadonlyArray<RankEntry>, track: Track): string[] {
  const distanceToNext = (e: RankEntry) => {
    const gate = track.gates[e.progress.nextGate];
    return gate ? Math.hypot(e.car.x - gate.x, e.car.z - gate.z) : 0;
  };
  return [...entries]
    .sort((a, b) => {
      const fa = a.progress.finishTick;
      const fb = b.progress.finishTick;
      if (fa !== null || fb !== null) {
        if (fa === null) return 1;
        if (fb === null) return -1;
        if (fa !== fb) return fa - fb;
      }
      if (a.progress.gatesPassed !== b.progress.gatesPassed) {
        return b.progress.gatesPassed - a.progress.gatesPassed;
      }
      const d = distanceToNext(a) - distanceToNext(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((e) => e.id);
}
