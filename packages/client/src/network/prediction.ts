import { type CarState, type PlayerInput, stepCarOnTrack, type Track } from "@racing/shared";

/**
 * Au-delà, on jette les plus anciens inputs non confirmés (2 s à 60 Hz).
 * Le serveur ne garde de toute façon que quelques inputs en file : un input aussi vieux
 * a été soit exécuté, soit jeté, et le rejouer n'aurait plus de sens.
 */
export const MAX_PENDING_INPUTS = 120;

/** Écart (m) au-delà duquel on ne lisse plus : on recale la voiture d'un coup. */
export const SNAP_DISTANCE = 4;

/** Vitesse de résorption de l'écart visuel (par seconde). 10 → 90 % effacé en 0,23 s. */
export const CORRECTION_RATE = 10;

/** Plus court écart angulaire de `from` vers `to`, dans ]-π, π]. */
function angleDiff(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Mélange deux états de voiture (t de 0 à 1). Le cap passe par le plus court chemin. */
export function lerpCarState(a: CarState, b: CarState, t: number): CarState {
  const k = Math.min(1, Math.max(0, t));
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    heading: a.heading + angleDiff(a.heading, b.heading) * k,
    vx: a.vx + (b.vx - a.vx) * k,
    vz: a.vz + (b.vz - a.vz) * k,
  };
}

/** Résultat d'une réconciliation. */
export interface Correction {
  /** Distance (m) entre ce qu'on avait prédit et ce que donne la version corrigée. */
  distance: number;
  /** true si l'écart était trop grand pour être lissé : la voiture a été recalée. */
  snapped: boolean;
}

/**
 * PRÉDICTION CÔTÉ CLIENT ET RÉCONCILIATION
 *
 * Prédiction : sans elle, ma voiture n'avance qu'une fois que le serveur a reçu mon
 * input, l'a simulé et m'a renvoyé un snapshot : on ressent tout le ping comme un retard.
 * Le client applique donc lui-même chaque input au moment où il l'envoie, avec
 * EXACTEMENT la même fonction que le serveur (stepCarOnTrack, dans shared).
 *
 * Réconciliation : le serveur reste la seule vérité. Chaque snapshot dit « voici ta
 * voiture après ton input n° lastInputSeq ». On repart de cet état, on jette les inputs
 * confirmés et on rejoue les autres. Simulation déterministe → on retombe (presque
 * toujours) pile sur la prédiction. Sinon (input perdu, arrondi différent d'un
 * navigateur à l'autre...), la prédiction est corrigée.
 *
 * Lissage : pour que la correction ne se voie pas comme une téléportation, on garde
 * l'écart dans un décalage purement VISUEL qui revient à zéro en une fraction de seconde.
 * La simulation, elle, est corrigée immédiatement.
 *
 * Cette classe ne connaît ni React ni Socket.IO : elle est testable seule.
 */
export class Predictor {
  private readonly track: Track;
  /** État prédit après le dernier input appliqué. null tant qu'on ignore où on est. */
  private current: CarState | null = null;
  /** État au pas précédent, pour lisser l'affichage entre deux pas (voir renderState). */
  private previous: CarState | null = null;
  /** Inputs envoyés mais pas encore confirmés par le serveur, du plus ancien au plus récent. */
  private readonly pending: PlayerInput[] = [];
  /** Dernier input confirmé par le serveur. */
  private lastAckedSeq = 0;
  /** Décalage visuel restant à résorber (affiché = simulé + décalage). */
  private offset = { x: 0, z: 0, heading: 0 };
  /**
   * Voiture bloquée (décompte, spectateur) : même règle que le serveur (isCarFrozen).
   * Les inputs sont gardés en attente mais ne font pas bouger la voiture.
   */
  private frozen = false;

  constructor(track: Track) {
    this.track = track;
  }

  get state(): Readonly<CarState> | null {
    return this.current;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Distance (m) du décalage visuel restant. */
  get visualOffset(): number {
    return Math.hypot(this.offset.x, this.offset.z);
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** Un pas de simulation, sauf si la voiture est bloquée. */
  private simulate(state: CarState, input: PlayerInput): CarState {
    return this.frozen ? state : stepCarOnTrack(state, input, this.track);
  }

  /** Un input vient d'être envoyé : on le mémorise et on l'applique tout de suite. */
  applyInput(input: PlayerInput): void {
    this.pending.push(input);
    if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
    if (this.current) {
      this.previous = this.current;
      this.current = this.simulate(this.current, input);
    }
  }

  /**
   * Nouvel état officiel de ma voiture : on repart de lui et on rejoue les inputs
   * que le serveur n'a pas encore exécutés (seq > lastInputSeq).
   * Renvoie null si le snapshot est ignoré (plus ancien qu'un snapshot déjà traité).
   */
  reconcile(server: CarState, lastInputSeq: number): Correction | null {
    if (lastInputSeq < this.lastAckedSeq) return null;
    this.lastAckedSeq = lastInputSeq;
    this.dropAcknowledged(lastInputSeq);

    const before = this.current;

    // Rejeu. On garde aussi l'avant-dernier état pour que renderState continue
    // d'interpoler normalement entre deux pas.
    let state = pickCarState(server);
    let previous = state;
    for (const input of this.pending) {
      previous = state;
      state = this.simulate(state, input);
    }
    this.current = state;
    this.previous = previous;

    // Premier snapshot : rien à lisser.
    if (!before) return { distance: 0, snapped: false };

    const dx = before.x - state.x;
    const dz = before.z - state.z;
    const distance = Math.hypot(dx, dz);
    if (distance > SNAP_DISTANCE) {
      this.offset = { x: 0, z: 0, heading: 0 };
      return { distance, snapped: true };
    }
    // L'affichage reste là où il était : l'ancien décalage + l'écart de cette correction.
    this.offset = {
      x: this.offset.x + dx,
      z: this.offset.z + dz,
      heading: this.offset.heading + angleDiff(state.heading, before.heading),
    };
    return { distance, snapped: false };
  }

  /** Résorbe le décalage visuel. À appeler à chaque image avec la durée de l'image (s). */
  decayOffset(dt: number): void {
    const k = Math.exp(-CORRECTION_RATE * dt);
    this.offset = { x: this.offset.x * k, z: this.offset.z * k, heading: this.offset.heading * k };
  }

  /**
   * État à dessiner. La simulation avance par pas de 1/60 s mais l'écran peut tourner
   * à 144 Hz : `alpha` (0 → 1) indique où on en est entre le pas précédent et le pas
   * actuel. On interpole entre les deux pour éviter les saccades, puis on ajoute le
   * décalage visuel de la réconciliation.
   */
  renderState(alpha: number): CarState | null {
    const a = this.previous;
    const b = this.current;
    if (!a || !b) return b;
    const s = lerpCarState(a, b, alpha);
    return {
      ...s,
      x: s.x + this.offset.x,
      z: s.z + this.offset.z,
      heading: s.heading + this.offset.heading,
    };
  }

  /** Oublie tout (nouvelle connexion : le serveur a recréé ma voiture). */
  reset(): void {
    this.current = null;
    this.previous = null;
    this.pending.length = 0;
    this.lastAckedSeq = 0;
    this.frozen = false;
    this.offset = { x: 0, z: 0, heading: 0 };
  }

  /** Retire les inputs que le serveur a déjà exécutés. */
  private dropAcknowledged(lastInputSeq: number): void {
    let n = 0;
    while (n < this.pending.length && (this.pending[n]?.seq ?? Infinity) <= lastInputSeq) n++;
    this.pending.splice(0, n);
  }
}

/** Ne garde que les champs physiques (un CarSnapshot contient aussi id et lastInputSeq). */
function pickCarState(s: CarState): CarState {
  return { x: s.x, z: s.z, heading: s.heading, vx: s.vx, vz: s.vz };
}
