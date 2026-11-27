import { useEffect, useState } from "react";
import {
  fetchHistory,
  fetchStats,
  type RaceHistoryEntry,
  type UserStats,
} from "../network/accountApi";
import { formatRaceTime, ordinal } from "./format";

/** Statistiques et dernières courses d'un joueur. */
export function ProfilePanel({ username, onClose }: { username: string; onClose: () => void }) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [history, setHistory] = useState<RaceHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchStats(username), fetchHistory(username)]).then(([s, h]) => {
      if (cancelled) return;
      if (s.ok) setStats(s.data.stats);
      else setError(s.message);
      if (h.ok) setHistory(h.data.races);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="screen">
      <div className="panel profile">
        <h2>{username}</h2>
        {error && <p className="error">{error}</p>}
        {!stats && !error && <p className="muted">Chargement…</p>}
        {stats && (
          <>
            <div className="stats">
              <div>
                <strong>{stats.races}</strong>
                <span className="muted">courses</span>
              </div>
              <div>
                <strong>{stats.wins}</strong>
                <span className="muted">victoires</span>
              </div>
              <div>
                <strong>{stats.podiums}</strong>
                <span className="muted">podiums</span>
              </div>
              <div>
                <strong>{stats.finished}</strong>
                <span className="muted">terminées</span>
              </div>
            </div>
            {stats.bestTimes.length > 0 && (
              <>
                <h3>Meilleurs temps</h3>
                <table>
                  <tbody>
                    {stats.bestTimes.map((b) => (
                      <tr key={`${b.trackId}-${b.laps}`}>
                        <td>{b.trackId}</td>
                        <td>
                          {b.laps} {b.laps > 1 ? "tours" : "tour"}
                        </td>
                        <td className="time">{formatRaceTime(b.timeMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <h3>Dernières courses</h3>
            {history.length === 0 ? (
              <p className="muted">Aucune course pour l'instant.</p>
            ) : (
              <table>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.raceId}>
                      <td>{new Date(r.finishedAt).toLocaleString("fr-FR")}</td>
                      <td>
                        {ordinal(r.rank)}/{r.participants}
                      </td>
                      <td className="time">{formatRaceTime(r.timeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          Retour
        </button>
      </div>
    </div>
  );
}
