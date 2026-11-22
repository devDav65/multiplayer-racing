import { BufferGeometry, Float32BufferAttribute } from "three";
import { wrapAt, type Track } from "@racing/shared";

type Vec3 = readonly [number, number, number];

const WALL_HEIGHT = 1;

/** Bord de la piste : la ligne centrale décalée de ±halfWidth le long de la normale. */
function edgeLoop(track: Track, side: 1 | -1, y: number): Vec3[] {
  return track.points.map((p, i) => {
    const n = wrapAt(track.normals, i);
    return [p.x + n.x * track.halfWidth * side, y, p.z + n.z * track.halfWidth * side] as const;
  });
}

/**
 * Ruban fermé entre deux polylignes de même longueur : pour chaque paire de points
 * consécutifs, deux triangles forment un quadrilatère.
 */
function ribbonGeometry(a: Vec3[], b: Vec3[]): BufferGeometry {
  const count = a.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    positions.push(...wrapAt(a, i), ...wrapAt(b, i));
  }
  for (let i = 0; i < count; i++) {
    const a0 = 2 * i;
    const b0 = 2 * i + 1;
    const a1 = 2 * ((i + 1) % count);
    const b1 = a1 + 1;
    indices.push(a0, b0, a1, b0, b1, a1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** La surface de la route (légèrement au-dessus du sol pour éviter le scintillement). */
export function buildRoadGeometry(track: Track): BufferGeometry {
  return ribbonGeometry(edgeLoop(track, 1, 0.02), edgeLoop(track, -1, 0.02));
}

/** Les deux murs, un de chaque côté. */
export function buildWallGeometries(track: Track): BufferGeometry[] {
  return ([1, -1] as const).map((side) =>
    ribbonGeometry(edgeLoop(track, side, 0), edgeLoop(track, side, WALL_HEIGHT)),
  );
}