// Roues : [x, z] par rapport au centre de la voiture. L'avant est du côté -Z.
const WHEELS: ReadonlyArray<readonly [number, number]> = [
  [-0.95, -1.2],
  [0.95, -1.2],
  [-0.95, 1.2],
  [0.95, 1.2],
];

/** Modèle provisoire fait de boîtes. Purement visuel : aucune logique de jeu ici. */
export function CarModel() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.8, 0.6, 4]} />
        <meshStandardMaterial color="#d62828" />
      </mesh>
      <mesh position={[0, 1.05, 0.3]} castShadow>
        <boxGeometry args={[1.5, 0.5, 2]} />
        <meshStandardMaterial color="#222222" />
      </mesh>
      {/* Phares à l'avant, pour repérer le sens de la voiture */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.6, -2.01]}>
          <boxGeometry args={[0.4, 0.2, 0.05]} />
          <meshStandardMaterial color="#ffe66d" emissive="#ffe66d" emissiveIntensity={0.8} />
        </mesh>
      ))}
      {WHEELS.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.35, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.3, 16]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}