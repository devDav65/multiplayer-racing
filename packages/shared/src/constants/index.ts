/** Fréquence de la simulation physique, en Hz (mises à jour par seconde). */
export const SIM_TICK_RATE = 60;

/** Durée d'un pas de simulation, en secondes. */
export const SIM_DT = 1 / SIM_TICK_RATE;

/** Fréquence d'envoi des snapshots du serveur vers les clients, en Hz. */
export const SNAPSHOT_RATE = 20;

/** Nombre maximum de joueurs dans un salon. */
export const MAX_PLAYERS_PER_ROOM = 20;

/** Nombre de tours d'une course. */
export const RACE_LAPS = 3;

/** Durée du décompte avant le départ, en pas de simulation (3 s). */
export const COUNTDOWN_TICKS = 3 * SIM_TICK_RATE;

/** Temps laissé aux autres après l'arrivée du premier, en pas de simulation (30 s). */
export const FINISH_GRACE_TICKS = 30 * SIM_TICK_RATE;

/** Durée d'affichage des résultats avant le retour au lobby, en pas de simulation (10 s). */
export const RESULTS_TICKS = 10 * SIM_TICK_RATE;
