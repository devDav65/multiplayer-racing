import type { Snapshot } from "@racing/shared";

/**
 * Dernier snapshot reçu du serveur. Objet mutable HORS de React :
 * il change 20 fois par seconde et est lu 60 fois par seconde dans useFrame.
 */
export const gameState: { snapshot: Snapshot | null } = { snapshot: null };