import { z } from "zod";

/**
 * Schéma de validation d'un message `input`.
 * Les types TypeScript disparaissent à l'exécution : ce schéma est la VRAIE défense.
 * Il rejette NaN, les chaînes, les valeurs hors plage, les champs manquants...
 */
export const playerInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  throttle: z.number().min(-1).max(1),
  steer: z.number().min(-1).max(1),
  brake: z.number().min(0).max(1),
  handbrake: z.boolean(),
});
