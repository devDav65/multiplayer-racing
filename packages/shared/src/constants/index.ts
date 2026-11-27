/** Fréquence de la simulation physique, en Hz (mises à jour par seconde). */
export const SIM_TICK_RATE = 60;

/** Durée d'un pas de simulation, en secondes. */
export const SIM_DT = 1 / SIM_TICK_RATE;

/** Fréquence d'envoi des snapshots du serveur vers les clients, en Hz. */
export const SNAPSHOT_RATE = 20;

/** Nombre maximum de joueurs dans un salon. */
export const MAX_PLAYERS_PER_ROOM = 20;
