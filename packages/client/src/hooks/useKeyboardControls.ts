import { useCallback, useEffect, useRef } from "react";
import type { CarControls } from "@racing/shared";

// `event.code` désigne la touche PHYSIQUE, pas la lettre imprimée dessus.
// KeyW est donc « Z » sur un clavier AZERTY et « W » sur un QWERTY : ZQSD et WASD
// fonctionnent tous les deux, sans code supplémentaire.
const FORWARD = ["KeyW", "ArrowUp"];
const BACKWARD = ["KeyS", "ArrowDown"];
const LEFT = ["KeyA", "ArrowLeft"];
const RIGHT = ["KeyD", "ArrowRight"];

export function useKeyboardControls(): () => CarControls {
  // Un Set dans une ref : on le modifie à chaque touche SANS déclencher de rendu React.
  const pressed = useRef(new Set<string>());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      pressed.current.add(e.code);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressed.current.delete(e.code);
    };
    // Si la fenêtre perd le focus pendant qu'une touche est enfoncée, keyup n'arrive jamais.
    const onBlur = () => pressed.current.clear();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Fonction à appeler à chaque image pour connaître l'état actuel des touches.
  return useCallback((): CarControls => {
    const keys = pressed.current;
    const any = (codes: string[]) => codes.some((c) => keys.has(c));
    return {
      throttle: (any(FORWARD) ? 1 : 0) - (any(BACKWARD) ? 1 : 0),
      steer: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
      brake: 0, // « S » en avançant freine déjà ; ce champ servira à une manette plus tard
      handbrake: keys.has("Space"),
    };
  }, []);
}