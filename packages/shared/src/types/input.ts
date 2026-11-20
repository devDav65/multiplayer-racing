/**
 * Les intentions d'un joueur à un instant donné.
 * C'est CE QUE LE CLIENT ENVOIE au serveur, jamais une position.
 */
export interface PlayerInput {
  /** Numéro d'ordre de l'input, utile plus tard pour la réconciliation. */
  seq: number;
  /** Accélération : -1 (marche arrière) à 1 (plein gaz). */
  throttle: number;
  /** Direction : -1 (gauche) à 1 (droite). */
  steer: number;
  /** Frein : 0 à 1. */
  brake: number;
  /** Frein à main (touche espace). */
  handbrake: boolean;
}