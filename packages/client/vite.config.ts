import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Serveur de jeu en développement. */
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  build: {
    // Le morceau de la scène 3D contient Three.js (~900 Ko non compressés, ~250 Ko gzip),
    // indivisible. Il est chargé à part de l'accueil (voir App.tsx) : seuil relevé exprès.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Le client et le serveur partagent la même origine (comme derrière Caddy en
    // production) : les cookies de session marchent sans configuration CORS.
    proxy: {
      "/api": API_TARGET,
      "/socket.io": { target: API_TARGET, ws: true },
    },
  },
});
