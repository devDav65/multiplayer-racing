import { type CarState, type PlayerInput, stepCarOnTrack, type Track } from "@racing/shared";

/**
 * Au-delà, on jette les plus anciens inputs non confirmés (2 s à 60 Hz).
 * Le serveur ne garde de toute façon que quelques inputs en file : un input aussi vieux
 * a été soit exécuté, soit jeté, et le rejouer n'aurait plus de sens.
 */
export const MAX_PENDING_INPUTS = 120;

/**
 * PRÉDICTION CÔTÉ CLIENT
 *
 * Sans prédiction, ma voiture n'avance qu'une fois que le serveur a reçu mon input,
 * l'a simulé et m'a renvoyé un snapshot : on ressent tout le ping comme un retard.
 *
 * Avec prédiction, le client applique lui-même chaque input au moment où il l'envoie,
 * avec EXACTEMENT la même fonction que le serveur (stepCarOnTrack, dans shared).
 * Comme la simulation est déterministe, le résultat sera (presque toujours) celui que
 * le serveur calculera un peu plus tard.
 *
 * Cette classe ne connaît ni React ni Socket.IO : elle est testable seule.
 */
/** Mélange deux états de voiture (t de 0 à 1). Le cap passe par le plus court chemin. */
export function lerpCarState(a: CarState, b: CarState, t: number): CarState {
  const k = Math.min(1, Math.max(0, t));
  const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    heading: a.heading + turn * k,
    vx: a.vx + (b.vx - a.vx) * k,
    vz: a.vz + (b.vz - a.vz) * k,
  };
}

export class Predictor {
  private readonly track: Track;
  /** État prédit après le dernier input appliqué. null tant qu'on ignore où on est. */
  private current: CarState | null = null;
  /** État au pas précédent, pour lisser l'affichage entre deux pas (voir renderState). */
  private previous: CarState | null = null;
  /** Inputs envoyés mais pas encore confirmés par le serveur, du plus ancien au plus récent. */
  private readonly pending: PlayerInput[] = [];

  constructor(track: Track) {
    this.track = track;
  }

  get state(): Readonly<CarState> | null {
    return this.current;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Un input vient d'être envoyé : on le mémorise et on l'applique tout de suite. */
  applyInput(input: PlayerInput): void {
    this.pending.push(input);
    if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
    if (this.current) {
      this.previous = this.current;
      this.current = stepCarOnTrack(this.current, input, this.track);
    }
  }

  /**
   * Point de départ : l'état officiel de ma voiture, plus tous les inputs que
   * le serveur n'a pas encore exécutés (seq > lastInputSeq), rejoués par-dessus.
   */
  resetFromServer(server: CarState, lastInputSeq: number): void {
    this.dropAcknowledged(lastInputSeq);
    let state: CarState = { ...server };
    for (const input of this.pending) state = stepCarOnTrack(state, input, this.track);
    this.current = state;
    this.previous = state;
  }

  /**
   * État à dessiner. La simulation avance par pas de 1/60 s mais l'écran peut tourner
   * à 144 Hz : `alpha` (0 → 1) indique où on en est entre le pas précédent et le pas
   * actuel. On interpole entre les deux pour éviter les saccades.
   */
  renderState(alpha: number): CarState | null {
    const a = this.previous;
    const b = this.current;
    if (!a || !b) return b;
    return lerpCarState(a, b, alpha);
  }

  /** Oublie tout (nouvelle connexion : le serveur a recréé ma voiture). */
  reset(): void {
    this.current = null;
    this.previous = null;
    this.pending.length = 0;
  }

  /** Retire les inputs que le serveur a déjà exécutés. */
  private dropAcknowledged(lastInputSeq: number): void {
    let n = 0;
    while (n < this.pending.length && (this.pending[n]?.seq ?? Infinity) <= lastInputSeq) n++;
    this.pending.splice(0, n);
  }
}
