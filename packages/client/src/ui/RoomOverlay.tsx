import { leaveRoom, startRace } from "../network/roomApi";
import { useGameStore } from "../store/gameStore";
import { formatRaceTime, ordinal, ticksToSeconds } from "./format";

/** Liste des joueurs et bouton de départ, pendant le lobby. */
function LobbyPanel() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  if (!room) return null;
  const isHost = room.hostId === playerId;

  return (
    <div className="panel lobby">
      <div className="muted">Code du salon</div>
      <div className="room-code">{room.code}</div>
      <ul className="players">
        {room.players.map((p) => (
          <li key={p.id} className={p.id === playerId ? "me" : undefined}>
            {p.name}
            {p.id === room.hostId && <span className="tag">hôte</span>}
          </li>
        ))}
      </ul>
      <p className="muted">
        {room.totalLaps} {room.totalLaps > 1 ? "tours" : "tour"} · {room.players.length}/20 joueurs
        · roule librement en attendant
      </p>
      {isHost ? (
        <button type="button" onClick={startRace}>
          Lancer la course
        </button>
      ) : (
        <p>En attente de l'hôte…</p>
      )}
      <button type="button" className="secondary" onClick={leaveRoom}>
        Quitter
      </button>
    </div>
  );
}

/** Tour, position, et bandeaux (spectateur, arrivée). */
function RaceHud() {
  const race = useGameStore((s) => s.race);
  const me = useGameStore((s) => s.me);
  const racerCount = useGameStore((s) => s.racerCount);
  if (!race || !me) return null;

  if (me.spectator) {
    return <div className="banner">Course en cours : tu joueras la prochaine</div>;
  }
  return (
    <>
      <div className="race-hud">
        <div>
          <span className="muted">Tour</span> {me.lap}/{race.totalLaps}
        </div>
        {me.rank > 0 && (
          <div>
            <span className="muted">Position</span> {ordinal(me.rank)}/{racerCount}
          </div>
        )}
      </div>
      {me.finished && <div className="banner">Arrivé : {ordinal(me.rank)} !</div>}
      {race.phase === "racing" && !me.finished && race.ticksLeft !== null && (
        <div className="banner">Fin de la course dans {ticksToSeconds(race.ticksLeft)} s</div>
      )}
    </>
  );
}

function ResultsPanel() {
  const room = useGameStore((s) => s.room);
  const race = useGameStore((s) => s.race);
  const playerId = useGameStore((s) => s.playerId);
  if (!room?.results) return null;
  return (
    <div className="panel results">
      <h2>Résultats</h2>
      <table>
        <tbody>
          {room.results.map((r) => (
            <tr key={r.id} className={r.id === playerId ? "me" : undefined}>
              <td>{ordinal(r.rank)}</td>
              <td>{r.name}</td>
              <td className="time">{formatRaceTime(r.timeMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Retour au lobby dans {ticksToSeconds(race?.ticksLeft ?? null)} s</p>
    </div>
  );
}

/** Tout ce qui s'affiche par-dessus la scène 3D, selon la phase du salon. */
export function RoomOverlay() {
  const phase = useGameStore((s) => s.race?.phase ?? s.room?.phase);
  const ticksLeft = useGameStore((s) => s.race?.ticksLeft ?? null);

  switch (phase) {
    case "lobby":
      return <LobbyPanel />;
    case "countdown":
      return (
        <>
          <RaceHud />
          <div className="countdown">{ticksToSeconds(ticksLeft) || "GO"}</div>
        </>
      );
    case "racing":
      return <RaceHud />;
    case "results":
      return <ResultsPanel />;
    default:
      return null;
  }
}
