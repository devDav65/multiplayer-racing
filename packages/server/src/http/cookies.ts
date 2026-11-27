/** Lit l'en-tête Cookie (« a=1; b=2 ») en objet. Les valeurs mal encodées sont ignorées. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // valeur invalide : on l'ignore
    }
  }
  return cookies;
}

export const SESSION_COOKIE = "session";

/**
 * Cookie de session :
 * - HttpOnly : invisible pour le JavaScript de la page (une faille XSS ne peut pas le voler) ;
 * - SameSite=Lax : pas envoyé par les requêtes POST venant d'autres sites (protection CSRF) ;
 * - Secure en production : seulement en HTTPS.
 */
export function sessionCookie(token: string, maxAgeMs: number, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}
