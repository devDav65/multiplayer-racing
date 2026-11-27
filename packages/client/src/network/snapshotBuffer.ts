import type { CarSnapshot, Snapshot } from "@racing/shared";

/**
 * Retard d'affichage volontaire, en ms. Deux intervalles de snapshots (2 × 50 ms) :
 * on a presque toujours un snapshot avant ET après l'instant dessiné.
 */
export const INTERPOLATION_DELAY_MS = 100;

/** Combien de snapshots on garde en mémoire (30 × 50 ms = 1,5 s d'historique). */
const MAX_BUFFERED = 30;

interface TimedSnapshot {
  /** Heure d'arrivée chez le client (performance.now), en ms. */
  receivedAt: number;
  snapshot: Snapshot;
}

const buffer: TimedSnapshot[] = [];

export function pushSnapshot(snapshot: Snapshot, receivedAt: number = performance.now()): void {
  buffer.push({ receivedAt, snapshot });
  if (buffer.length > MAX_BUFFERED) buffer.shift();
}

/** Le snapshot le plus récent reçu, ou null. Sert à la prédiction (pas d'interpolation). */
export function latestSnapshot(): Snapshot | null {
  return buffer[buffer.length - 1]?.snapshot ?? null;
}

export function clearSnapshots(): void {
  buffer.length = 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpole un angle par le CHEMIN LE PLUS COURT. Un simple lerp de 3,1 vers -3,1
 * ferait presque un tour complet au lieu d'un petit pas de 0,08 rad.
 */
function lerpAngle(a: number, b: number, t: number): number {
  const shortestDiff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + shortestDiff * t;
}

function lerpCar(a: CarSnapshot, b: CarSnapshot, t: number): CarSnapshot {
  return {
    id: b.id,
    x: lerp(a.x, b.x, t),
    z: lerp(a.z, b.z, t),
    heading: lerpAngle(a.heading, b.heading, t),
    vx: lerp(a.vx, b.vx, t),
    vz: lerp(a.vz, b.vz, t),
    lastInputSeq: b.lastInputSeq,
  };
}

/**
 * Renvoie l'état des voitures à l'instant `renderTime` (en ms, même horloge que
 * `receivedAt`), ou null si aucun snapshot n'est encore arrivé.
 */
export function sampleCars(renderTime: number): CarSnapshot[] | null {
  const oldest = buffer[0];
  const newest = buffer[buffer.length - 1];
  if (!oldest || !newest) return null;

  // Hors de l'historique : on prend la valeur la plus proche. Pour le « futur »
  // (snapshots en retard), la voiture se fige brièvement au lieu d'être devinée.
  if (renderTime >= newest.receivedAt) return newest.snapshot.cars;
  if (renderTime <= oldest.receivedAt) return oldest.snapshot.cars;

  // On cherche, depuis la fin, la paire (a, b) qui encadre renderTime.
  for (let i = buffer.length - 2; i >= 0; i--) {
    const a = buffer[i];
    const b = buffer[i + 1];
    if (!a || !b) continue;
    if (a.receivedAt > renderTime) continue;

    const span = b.receivedAt - a.receivedAt;
    const t = span > 0 ? (renderTime - a.receivedAt) / span : 1;
    const before = new Map(a.snapshot.cars.map((car) => [car.id, car] as const));

    // On part de la liste de b : une voiture absente de b est partie, et une voiture
    // absente de a vient d'arriver (pas d'interpolation possible : on la place telle quelle).
    return b.snapshot.cars.map((car) => {
      const previous = before.get(car.id);
      return previous ? lerpCar(previous, car, t) : car;
    });
  }

  return oldest.snapshot.cars;
}
