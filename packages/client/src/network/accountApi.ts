import { useGameStore } from "../store/gameStore";
import { reconnectSocket } from "./socket";

export interface Account {
  id: number;
  username: string;
}

export interface UserStats {
  username: string;
  memberSince: string;
  races: number;
  wins: number;
  podiums: number;
  finished: number;
  bestTimes: Array<{ trackId: string; laps: number; timeMs: number }>;
}

export interface RaceHistoryEntry {
  raceId: number;
  trackId: string;
  laps: number;
  finishedAt: string;
  rank: number;
  participants: number;
  timeMs: number | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

/** Appel JSON vers /api. Les cookies partent automatiquement (même origine). */
async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const body = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok) {
      return { ok: false, error: body.error ?? "error", message: body.message ?? "Erreur." };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "network", message: "Serveur injoignable." };
  }
}

/** Au démarrage : suis-je connecté ? Les comptes sont-ils activés ? */
export async function loadAccount(): Promise<void> {
  const result = await api<{ user: Account }>("/auth/me");
  useGameStore.setState({
    account: result.ok ? result.data.user : null,
    accountsEnabled: result.ok || result.error !== "accounts_disabled",
  });
}

async function authenticate(path: "register" | "login", username: string, password: string) {
  const result = await api<{ user: Account }>(`/auth/${path}`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (result.ok) {
    useGameStore.setState({ account: result.data.user });
    reconnectSocket(); // le serveur doit voir le nouveau cookie
  }
  return result;
}

export const register = (username: string, password: string) =>
  authenticate("register", username, password);
export const login = (username: string, password: string) =>
  authenticate("login", username, password);

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" });
  useGameStore.setState({ account: null });
  reconnectSocket();
}

export function fetchStats(username: string) {
  return api<{ stats: UserStats }>(`/users/${encodeURIComponent(username)}/stats`);
}

export function fetchHistory(username: string) {
  return api<{ races: RaceHistoryEntry[] }>(`/users/${encodeURIComponent(username)}/races`);
}
