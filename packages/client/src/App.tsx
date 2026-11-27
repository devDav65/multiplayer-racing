import { lazy, Suspense, useEffect } from "react";
import { useConnection } from "./hooks/useConnection";
import { useGameStore } from "./store/gameStore";
import { HomeScreen } from "./ui/HomeScreen";

/**
 * La scène 3D (Three.js, React Three Fiber : l'essentiel du poids du site) est chargée
 * à part. L'écran d'accueil s'affiche donc tout de suite, et le moteur 3D se télécharge
 * en arrière-plan pendant que le joueur tape son pseudo.
 */
const loadGameScreen = () => import("./game/GameScreen");
const GameScreen = lazy(loadGameScreen);

export default function App() {
  useConnection();
  const inRoom = useGameStore((s) => s.room !== null);

  useEffect(() => {
    void loadGameScreen(); // préchargement
  }, []);

  if (!inRoom) return <HomeScreen />;
  return (
    <Suspense fallback={<div className="screen">Chargement du circuit…</div>}>
      <GameScreen />
    </Suspense>
  );
}
