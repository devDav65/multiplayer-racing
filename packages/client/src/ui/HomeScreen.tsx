import { type FormEvent, useState } from "react";
import { createRoom, joinRoom } from "../network/roomApi";
import { useGameStore } from "../store/gameStore";
import { AccountPanel } from "./AccountPanel";
import { ProfilePanel } from "./ProfilePanel";

const NAME_KEY = "racing.playerName";
const NAME_MAX = 16;

/** Écran d'accueil : pseudo, puis créer un salon ou en rejoindre un avec son code. */
export function HomeScreen() {
  const connected = useGameStore((s) => s.connected);
  const account = useGameStore((s) => s.account);
  const [showProfile, setShowProfile] = useState(false);
  const [guestName, setGuestName] = useState(() => localStorage.getItem(NAME_KEY) ?? "");
  // Connecté : le serveur impose le pseudo du compte, on l'affiche tel quel.
  const name = account?.username ?? guestName;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const canSubmit = connected && !busy && trimmed.length > 0;

  async function run(action: () => ReturnType<typeof createRoom>) {
    setBusy(true);
    setError(null);
    if (!account) localStorage.setItem(NAME_KEY, trimmed);
    const result = await action();
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  const onCreate = () => run(() => createRoom(trimmed));
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length > 0) void run(() => joinRoom(code.trim(), trimmed));
  };

  if (showProfile && account) {
    return <ProfilePanel username={account.username} onClose={() => setShowProfile(false)} />;
  }

  return (
    <div className="screen">
      <div className="panel home">
        <h1>Multiplayer Racing</h1>
        <label>
          Pseudo
          <input
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Ton pseudo"
            disabled={account !== null}
          />
        </label>
        <button type="button" disabled={!canSubmit} onClick={onCreate}>
          Créer un salon
        </button>
        <form onSubmit={onJoin} className="row">
          <input
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="code-input"
          />
          <button type="submit" disabled={!canSubmit || code.trim().length !== 4}>
            Rejoindre
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        {!connected && <p className="muted">Connexion au serveur…</p>}
        <AccountPanel onShowProfile={() => setShowProfile(true)} />
      </div>
    </div>
  );
}
