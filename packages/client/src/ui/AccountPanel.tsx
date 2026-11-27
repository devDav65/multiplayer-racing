import { type FormEvent, useState } from "react";
import { login, logout, register } from "../network/accountApi";
import { useGameStore } from "../store/gameStore";

/**
 * Compte du joueur, sur l'écran d'accueil. Optionnel : on peut jouer en invité,
 * mais seules les courses des joueurs connectés comptent dans les statistiques.
 */
export function AccountPanel({ onShowProfile }: { onShowProfile: () => void }) {
  const account = useGameStore((s) => s.account);
  const accountsEnabled = useGameStore((s) => s.accountsEnabled);
  const [mode, setMode] = useState<"closed" | "login" | "register">("closed");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!accountsEnabled) return null;

  if (account) {
    return (
      <div className="account">
        <span>
          Connecté : <strong>{account.username}</strong>
        </span>
        <div className="row">
          <button type="button" className="secondary" onClick={onShowProfile}>
            Mon profil
          </button>
          <button type="button" className="secondary" onClick={() => void logout()}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (mode === "closed") {
    return (
      <div className="account">
        <span className="muted">Invité : tes courses ne sont pas enregistrées.</span>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setMode("login")}>
            Se connecter
          </button>
          <button type="button" className="secondary" onClick={() => setMode("register")}>
            Créer un compte
          </button>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await (mode === "login" ? login : register)(username.trim(), password);
    setBusy(false);
    if (result.ok) {
      setPassword("");
      setMode("closed");
    } else {
      setError(result.message);
    }
  };

  return (
    <form className="account" onSubmit={onSubmit}>
      <strong>{mode === "login" ? "Connexion" : "Nouveau compte"}</strong>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Pseudo (3 à 16 : lettres, chiffres, _ -)"
        autoComplete="username"
        maxLength={16}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={mode === "register" ? "Mot de passe (8 caractères min.)" : "Mot de passe"}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        maxLength={128}
      />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={busy || !username.trim() || !password}>
          {mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>
        <button type="button" className="secondary" onClick={() => setMode("closed")}>
          Annuler
        </button>
      </div>
    </form>
  );
}
