import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight, Group } from "three";
import { SIM_DT, createCarState, stepCar, type CarState } from "@racing/shared";
import { useKeyboardControls } from "../../hooks/useKeyboardControls";
import { CarModel } from "./CarModel";

const CAMERA_DISTANCE = 8; // mètres derrière la voiture
const CAMERA_HEIGHT = 3.5; // mètres au-dessus du sol
const CAMERA_STIFFNESS = 5; // plus haut = caméra plus rigide
const MS_TO_KMH = 3.6;

interface PlayerCarProps {
  /** Élément HTML où écrire la vitesse (mis à jour directement, sans passer par React). */
  speedRef: RefObject<HTMLDivElement | null>;
}

export function PlayerCar({ speedRef }: PlayerCarProps) {
  const readControls = useKeyboardControls();
  const groupRef = useRef<Group>(null);
  const sunRef = useRef<DirectionalLight>(null);

  // Données qui changent 60 fois par seconde : des refs, pas du useState.
  const car = useRef<CarState>(createCarState());
  const accumulator = useRef(0);
  const lastSpeed = useRef(-1);
  const cameraTarget = useRef(new Vector3());

  // Simulation, voiture, caméra et soleil sont dans UN SEUL useFrame pour garantir
  // l'ordre : la caméra est calculée APRÈS que la voiture a bougé, dans la même image.
  useFrame(({ camera }, delta) => {
    // 1. Simulation à pas fixe. Le min() évite la « spirale de la mort » : après
    //    un gros ralentissement (onglet en arrière-plan), on ne rattrape pas 10 s d'un coup.
    accumulator.current += Math.min(delta, 0.1);
    const controls = readControls();
    while (accumulator.current >= SIM_DT) {
      car.current = stepCar(car.current, controls);
      accumulator.current -= SIM_DT;
    }
    const { x, z, heading, vx, vz } = car.current;

    // 2. Appliquer l'état au modèle 3D.
    const group = groupRef.current;
    if (group) {
      group.position.set(x, 0, z);
      group.rotation.y = heading;
    }

    // 3. Caméra : se place derrière la voiture, en rattrapant sa cible en douceur.
    //    1 - exp(-k·delta) rend le lissage identique à 60 ou 144 Hz.
    const forwardX = -Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    cameraTarget.current.set(
      x - forwardX * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      z - forwardZ * CAMERA_DISTANCE,
    );
    camera.position.lerp(cameraTarget.current, 1 - Math.exp(-CAMERA_STIFFNESS * delta));
    camera.lookAt(x, 1, z);

    // 4. Le soleil suit la voiture, sinon les ombres n'existent qu'autour de l'origine.
    const sun = sunRef.current;
    if (sun) {
      sun.position.set(x + 10, 15, z + 5);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    }

    // 5. Vitesse : on écrit dans le DOM uniquement quand la valeur affichée change.
    const kmh = Math.round(Math.hypot(vx, vz) * MS_TO_KMH);
    if (speedRef.current && kmh !== lastSpeed.current) {
      speedRef.current.textContent = `${kmh} km/h`;
      lastSpeed.current = kmh;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <CarModel />
      </group>
      <directionalLight
        ref={sunRef}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
      />
    </>
  );
}