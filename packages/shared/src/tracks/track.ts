import { wrapAt } from "../utils";

/** Point ou vecteur 2D sur le plan du sol (x = est, z = sud). */
export interface Vec2 {
  x: number;
  z: number;
}

/** Description d'un circuit, en données pures. */
export interface TrackDefinition {
  id: string;
  name: string;
  /** Demi-largeur de la piste en mètres (largeur totale = 2 × halfWidth). */
  halfWidth: number;
  /** Points de passage de la ligne centrale [x, z], dans l'ordre. La boucle se referme seule. */
  controlPoints: ReadonlyArray<readonly [number, number]>;
  /** Index du point de passage où la voiture apparaît, dans le sens de la course. */
  startControlIndex: number;
}

/** Circuit prêt à l'emploi : courbe échantillonnée en petits segments. */
export interface Track {
  id: string;
  name: string;
  halfWidth: number;
  /** Ligne centrale, échantillonnée. Les segments relient chaque point au suivant (boucle fermée). */
  points: Vec2[];
  /** Normale (vecteur perpendiculaire) de chaque point, sert à placer les bords. */
  normals: Vec2[];
  spawn: { x: number; z: number; heading: number };
  /** Longueur de la ligne centrale, en mètres. */
  length: number;
}

/** Interpolation Catmull-Rom : courbe lisse qui passe par p1 (t=0) et p2 (t=1). */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function buildTrack(def: TrackDefinition, samplesPerSegment = 16): Track {
  const controls = def.controlPoints;
  if (controls.length < 4) {
    throw new Error("Un circuit nécessite au moins 4 points de passage");
  }

  // 1) Échantillonner la courbe fermée.
  const points: Vec2[] = [];
  for (let i = 0; i < controls.length; i++) {
    const p0 = wrapAt(controls, i - 1);
    const p1 = wrapAt(controls, i);
    const p2 = wrapAt(controls, i + 1);
    const p3 = wrapAt(controls, i + 2);
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      points.push({
        x: catmullRom(p0[0], p1[0], p2[0], p3[0], t),
        z: catmullRom(p0[1], p1[1], p2[1], p3[1], t),
      });
    }
  }

  // 2) Normales et longueur.
  const normals: Vec2[] = [];
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const prev = wrapAt(points, i - 1);
    const cur = wrapAt(points, i);
    const next = wrapAt(points, i + 1);
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tangentLength = Math.hypot(tx, tz);
    normals.push({ x: -tz / tangentLength, z: tx / tangentLength });
    length += Math.hypot(next.x - cur.x, next.z - cur.z);
  }

  // 3) Point d'apparition et cap : on regarde vers le point suivant de la ligne.
  //    Avec forward = (-sin h, -cos h), la direction (dx, dz) correspond à h = atan2(-dx, -dz).
  const startIndex = def.startControlIndex * samplesPerSegment;
  const start = wrapAt(points, startIndex);
  const ahead = wrapAt(points, startIndex + 1);
  const heading = Math.atan2(-(ahead.x - start.x), -(ahead.z - start.z));

  return {
    id: def.id,
    name: def.name,
    halfWidth: def.halfWidth,
    points,
    normals,
    spawn: { x: start.x, z: start.z, heading },
    length,
  };
}

export interface TrackProjection {
  /** Point le plus proche sur la ligne centrale. */
  px: number;
  pz: number;
  /** Distance entre le point testé et la ligne centrale. */
  distance: number;
}

/** Trouve le point de la ligne centrale le plus proche de (x, z). */
export function nearestOnTrack(track: Track, x: number, z: number): TrackProjection {
  const points = track.points;
  let bestD2 = Infinity;
  let bestX = 0;
  let bestZ = 0;

  for (let i = 0; i < points.length; i++) {
    const a = wrapAt(points, i);
    const b = wrapAt(points, i + 1);
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    // Projection de (x,z) sur le segment [a,b], ramenée dans le segment.
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / len2));
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestX = qx;
      bestZ = qz;
    }
  }

  return { px: bestX, pz: bestZ, distance: Math.sqrt(bestD2) };
}
