import { type CarState, SIM_DT, type Track } from "@racing/shared";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef, useState } from "react";
import type { DirectionalLight, Group } from "three";
import { Vector3 } from "three";
import { useGameNetwork } from "../hooks/useGameNetwork";
import { useKeyboardControls } from "../hooks/useKeyboardControls";
import { sendInput } from "../network/inputStream";
import { Predictor } from "../network/prediction";
import { INTERPOLATION_DELAY_MS, latestSnapshot, sampleCars } from "../network/snapshotBuffer";
import { socket } from "../network/socket";
import { CarModel } from "./vehicles/CarModel";

const CAMERA_DISTANCE = 8;
const CAMERA_HEIGHT = 3.5;
const CAMERA_STIFFNESS = 5;
const MS_TO_KMH = 3.6;
const MY_COLOR = "#d62828";
const OTHER_COLOR = "#2a6fdb";

interface NetworkedGameProps {
  track: Track;
  speedRef: RefObject<HTMLDivElement | null>;
}

export function NetworkedGame({ track, speedRef }: NetworkedGameProps) {
  const readControls = useKeyboardControls();
  useGameNetwork();
  // La LISTE des voitures change rarement (arrivée/départ d'un joueur) : state React.
  // Leurs POSITIONS changent en permanence : refs, modifiées dans useFrame.
  const [carIds, setCarIds] = useState<string[]>([]);
  const idsKey = useRef("");
  const groups = useRef(new Map<string, Group>());
  const sunRef = useRef<DirectionalLight>(null);
  const cameraTarget = useRef(new Vector3());
  const cameraReady = useRef(false);
  const lastSpeed = useRef(-1);
  const inputAccumulator = useRef(0);
  const predictor = useMemo(() => new Predictor(track), [track]);
  /** Identifiant du joueur dont le Predictor suit la voiture (change à chaque reconnexion). */
  const predictedId = useRef<string | undefined>(undefined);

  useFrame(({ camera }, delta) => {
    // 0. Nouvelle connexion = nouvelle voiture côté serveur : on repart de zéro.
    if (socket.id !== predictedId.current) {
      predictor.reset();
      predictedId.current = socket.id;
    }

    // 1. Point de départ de la prédiction : le premier état officiel de ma voiture.
    if (!predictor.state) {
      const official = latestSnapshot()?.cars.find((c) => c.id === socket.id);
      if (official) predictor.resetFromServer(official, official.lastInputSeq);
    }

    // 2. Un input par pas de simulation : même accumulateur à pas fixe que le serveur.
    //    On envoie même quand aucune touche n'est enfoncée (touches à zéro) : le serveur
    //    attend un input par pas, sinon il fige la voiture.
    //    Chaque input envoyé est aussi appliqué TOUT DE SUITE en local : c'est la prédiction.
    inputAccumulator.current += Math.min(delta, 0.1);
    const controls = readControls();
    while (inputAccumulator.current >= SIM_DT) {
      const input = sendInput(controls);
      if (input) predictor.applyInput(input);
      inputAccumulator.current -= SIM_DT;
    }

    // 3. Les AUTRES voitures : où étaient-elles il y a INTERPOLATION_DELAY_MS ?
    const cars = sampleCars(performance.now() - INTERPOLATION_DELAY_MS);
    if (!cars) return;

    // 4. Mettre à jour la liste des voitures seulement si elle a changé.
    const key = cars.map((c) => c.id).join(",");
    if (key !== idsKey.current) {
      idsKey.current = key;
      setCarIds(cars.map((c) => c.id));
    }

    // 5. MA voiture vient de la prédiction (pas de retard), entre deux pas de simulation.
    //    Tant que la prédiction n'a pas démarré, on se rabat sur la version interpolée.
    const predicted = predictor.renderState(inputAccumulator.current / SIM_DT);
    let mine: CarState | undefined = predicted ?? undefined;
    for (const car of cars) {
      const isMine = car.id === socket.id;
      if (isMine && !mine) mine = car;
      const shown = isMine && mine ? mine : car;
      const group = groups.current.get(car.id);
      if (group) {
        group.position.set(shown.x, 0, shown.z);
        group.rotation.y = shown.heading;
      }
    }
    if (!mine) return;

    // 6. Caméra derrière MA voiture.
    const forwardX = -Math.sin(mine.heading);
    const forwardZ = -Math.cos(mine.heading);
    cameraTarget.current.set(
      mine.x - forwardX * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      mine.z - forwardZ * CAMERA_DISTANCE,
    );
    if (!cameraReady.current) {
      camera.position.copy(cameraTarget.current);
      cameraReady.current = true;
    } else {
      camera.position.lerp(cameraTarget.current, 1 - Math.exp(-CAMERA_STIFFNESS * delta));
    }
    camera.lookAt(mine.x, 1, mine.z);

    // 7. Le soleil suit ma voiture.
    const sun = sunRef.current;
    if (sun) {
      sun.position.set(mine.x + 10, 15, mine.z + 5);
      sun.target.position.set(mine.x, 0, mine.z);
      sun.target.updateMatrixWorld();
    }

    // 8. Vitesse.
    const kmh = Math.round(Math.hypot(mine.vx, mine.vz) * MS_TO_KMH);
    if (speedRef.current && kmh !== lastSpeed.current) {
      speedRef.current.textContent = `${kmh} km/h`;
      lastSpeed.current = kmh;
    }
  });

  return (
    <>
      {carIds.map((id) => (
        <group
          key={id}
          ref={(group) => {
            if (group) groups.current.set(id, group);
            else groups.current.delete(id);
          }}
        >
          <CarModel color={id === socket.id ? MY_COLOR : OTHER_COLOR} />
        </group>
      ))}
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
