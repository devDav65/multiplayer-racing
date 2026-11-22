import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { DirectionalLight, Group } from "three";
import { SIM_DT, createCarState, stepCarOnTrack, type CarState, type Track } from "@racing/shared";
import { useKeyboardControls } from "../../hooks/useKeyboardControls";
import { CarModel } from "./CarModel";

const CAMERA_DISTANCE = 8;
const CAMERA_HEIGHT = 3.5;
const CAMERA_STIFFNESS = 5;
const MS_TO_KMH = 3.6;

interface PlayerCarProps {
  track: Track;
  /** Élément HTML où écrire la vitesse (mis à jour directement, sans passer par React). */
  speedRef: RefObject<HTMLDivElement | null>;
}

export function PlayerCar({ track, speedRef }: PlayerCarProps) {
  const readControls = useKeyboardControls();
  const groupRef = useRef<Group>(null);
  const sunRef = useRef<DirectionalLight>(null);

  const car = useRef<CarState>(
    createCarState(track.spawn.x, track.spawn.z, track.spawn.heading),
  );
  const accumulator = useRef(0);
  const lastSpeed = useRef(-1);
  const cameraTarget = useRef(new Vector3());
  const cameraReady = useRef(false);

  useFrame(({ camera }, delta) => {
    // 1. Simulation à pas fixe : conduite + collisions avec les murs.
    accumulator.current += Math.min(delta, 0.1);
    const controls = readControls();
    while (accumulator.current >= SIM_DT) {
      car.current = stepCarOnTrack(car.current, controls, track);
      accumulator.current -= SIM_DT;
    }
    const { x, z, heading, vx, vz } = car.current;

    // 2. Appliquer l'état au modèle 3D.
    const group = groupRef.current;
    if (group) {
      group.position.set(x, 0, z);
      group.rotation.y = heading;
    }

    // 3. Caméra derrière la voiture. À la première image, on la place directement
    //    (sinon elle traverserait la scène depuis sa position initiale).
    const forwardX = -Math.sin(heading);
    const forwardZ = -Math.cos(heading);
    cameraTarget.current.set(
      x - forwardX * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      z - forwardZ * CAMERA_DISTANCE,
    );
    if (!cameraReady.current) {
      camera.position.copy(cameraTarget.current);
      cameraReady.current = true;
    } else {
      camera.position.lerp(cameraTarget.current, 1 - Math.exp(-CAMERA_STIFFNESS * delta));
    }
    camera.lookAt(x, 1, z);

    // 4. Le soleil suit la voiture pour que les ombres restent visibles.
    const sun = sunRef.current;
    if (sun) {
      sun.position.set(x + 10, 15, z + 5);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    }

    // 5. Vitesse affichée, écrite dans le DOM seulement quand elle change.
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