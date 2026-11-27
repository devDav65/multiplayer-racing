import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * HACHAGE DES MOTS DE PASSE
 *
 * On ne stocke jamais un mot de passe, seulement le résultat d'une fonction lente et
 * gourmande en mémoire (scrypt). Si la base fuit, retrouver les mots de passe coûte
 * très cher à l'attaquant. Le sel (aléatoire, différent pour chaque compte) empêche
 * d'attaquer tous les comptes d'un coup.
 *
 * Paramètres : une des configurations recommandées par l'OWASP (N=2^15, r=8, p=3,
 * soit environ 32 Mo par calcul). Ils sont enregistrés dans le hash, ce qui permettra de
 * les renforcer plus tard sans casser les comptes existants.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const PREFIX = "scrypt";

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function scryptAsync(password: string, salt: Buffer, options: ScryptParams): Promise<Buffer> {
  // maxmem : la limite par défaut de Node (32 Mo) est juste en dessous de ce qu'il faut.
  const maxmem = 128 * options.N * options.r * 2;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Renvoie « scrypt$N$r$p$sel$hash » (sel et hash en base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, PARAMS);
  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Vérifie un mot de passe. Comparaison en temps constant : le temps de réponse ne révèle rien. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, n, r, p, salt, hash] = stored.split("$");
  if (prefix !== PREFIX || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password, Buffer.from(salt, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Hash factice pour un pseudo inconnu : on calcule quand même un scrypt, sinon
 * « pseudo inconnu » répondrait plus vite que « mauvais mot de passe » et un
 * attaquant pourrait deviner quels comptes existent.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
