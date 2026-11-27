import { z } from "zod";

/** Pseudo de compte : 3 à 16 lettres non accentuées, chiffres, _ ou -. */
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,16}$/, "3 à 16 caractères : lettres, chiffres, _ ou -");

/**
 * Mot de passe : au moins 8 caractères (recommandation actuelle : longueur plutôt que
 * règles de complexité), au plus 128 pour borner le coût du hachage.
 */
export const passwordSchema = z
  .string()
  .min(8, "Au moins 8 caractères")
  .max(128, "128 caractères au maximum");

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
