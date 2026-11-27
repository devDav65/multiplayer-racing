import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Serveur de jeu en développement. */
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    // Le client et le serveur partagent la même origine (comme derrière Caddy en
    // production) : les cookies de session marchent sans configuration CORS.
    proxy: {
      "/api": API_TARGET,
      "/socket.io": { target: API_TARGET, ws: true },
    },
  },
});
