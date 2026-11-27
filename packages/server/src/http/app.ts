import express, { type NextFunction, type Request, type Response } from "express";
import type { AuthService } from "../auth/AuthService";
import { SESSION_TTL_MS } from "../auth/AuthService";
import { KeyedRateLimiter } from "../network/KeyedRateLimiter";
import { credentialsSchema } from "./authSchemas";
import { clearSessionCookie, parseCookies, SESSION_COOKIE, sessionCookie } from "./cookies";

export interface HttpAppOptions {
  /** null : pas de base de données, les comptes sont désactivés. */
  auth: AuthService | null;
  /** Origine du client : les requêtes qui modifient quelque chose doivent en venir. */
  clientOrigin: string;
  /** Cookie Secure (HTTPS seulement). Vrai en production. */
  secureCookies: boolean;
  /** Nombre de proxys de confiance devant le serveur (Caddy = 1), pour lire la vraie IP. */
  trustProxy: number;
  now?: () => number;
}

/** Réponse d'erreur : un code stable pour le programme, un message lisible pour le joueur. */
function fail(res: Response, status: number, error: string, message: string) {
  res.status(status).json({ error, message });
}

export function createHttpApp(options: HttpAppOptions): express.Express {
  const { auth, clientOrigin, secureCookies } = options;
  const now = options.now ?? performance.now.bind(performance);
  // Inscription : 5 d'un coup puis 1 toutes les 10 s par IP. Connexion : 10 puis 1 toutes les 5 s.
  const registerLimiter = new KeyedRateLimiter(5, 0.1, now);
  const loginLimiter = new KeyedRateLimiter(10, 0.2, now);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", options.trustProxy);
  app.use(express.json({ limit: "4kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", time: Date.now() });
  });

  // Protection CSRF en plus de SameSite : une requête qui modifie quelque chose et qui
  // annonce venir d'un autre site est refusée.
  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (req.method !== "GET" && origin !== undefined && origin !== clientOrigin) {
      return fail(res, 403, "bad_origin", "Origine non autorisée.");
    }
    next();
  });

  app.use("/api/auth", (_req: Request, res: Response, next: NextFunction) => {
    if (!auth) return fail(res, 503, "accounts_disabled", "Les comptes sont désactivés.");
    next();
  });

  const tokenOf = (req: Request) => parseCookies(req.headers.cookie)[SESSION_COOKIE];

  const startSession = async (res: Response, userId: number) => {
    if (!auth) return;
    const { token } = await auth.createSession(userId);
    res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL_MS, secureCookies));
  };

  app.post("/api/auth/register", async (req, res) => {
    if (!auth) return;
    if (!registerLimiter.tryConsume(req.ip ?? "?")) {
      return fail(res, 429, "rate_limited", "Trop de tentatives, réessaie dans un moment.");
    }
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(res, 400, "invalid_input", parsed.error.issues[0]?.message ?? "Entrée invalide.");
    }
    const result = await auth.register(parsed.data.username, parsed.data.password);
    if (!result.ok) return fail(res, 409, "username_taken", "Ce pseudo est déjà pris.");
    await startSession(res, result.user.id);
    res.status(201).json({ user: result.user });
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!auth) return;
    if (!loginLimiter.tryConsume(req.ip ?? "?")) {
      return fail(res, 429, "rate_limited", "Trop de tentatives, réessaie dans un moment.");
    }
    const parsed = credentialsSchema.safeParse(req.body);
    // Message identique pour « pseudo inconnu » et « mauvais mot de passe ».
    const user = parsed.success
      ? await auth.login(parsed.data.username, parsed.data.password)
      : null;
    if (!user) return fail(res, 401, "invalid_credentials", "Pseudo ou mot de passe incorrect.");
    await startSession(res, user.id);
    res.json({ user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = tokenOf(req);
    if (auth && token) await auth.deleteSession(token);
    res.setHeader("Set-Cookie", clearSessionCookie(secureCookies));
    res.status(204).end();
  });

  app.get("/api/auth/me", async (req, res) => {
    const token = tokenOf(req);
    const user = auth && token ? await auth.getSessionUser(token) : null;
    if (!user) return fail(res, 401, "not_logged_in", "Non connecté.");
    res.json({ user });
  });

  // Erreurs inattendues (base injoignable...) : on journalise, sans détails pour le client.
  // JSON mal formé : express.json renvoie une erreur 400 qu'on transmet telle quelle.
  app.use(
    (error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
      if (error.status && error.status < 500) {
        return fail(res, error.status, "bad_request", "Requête invalide.");
      }
      console.error("[http]", error);
      fail(res, 500, "internal_error", "Erreur interne, réessaie plus tard.");
    },
  );

  return app;
}
