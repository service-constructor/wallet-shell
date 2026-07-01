import { useState } from "react";
import { api, type User } from "./api";

// AuthScreen toggles between login and register. On success the BFF has set the
// session cookie and returned the user, which we hand up to the shell.
export function AuthScreen({
  onAuthed,
  onError,
}: {
  onAuthed: (u: User) => void;
  onError: (msg: string | null) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const { user } = mode === "login" ? await api.login(login, password) : await api.register(login, password);
      onAuthed(user);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card auth">
      <div className="tabs">
        <button className={mode === "login" ? "tab on" : "tab"} onClick={() => setMode("login")}>
          Sign in
        </button>
        <button className={mode === "register" ? "tab on" : "tab"} onClick={() => setMode("register")}>
          Register
        </button>
      </div>
      <form onSubmit={submit} className="form">
        <label>
          Login
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        <button className="primary" disabled={busy || !login || !password}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      {mode === "register" && (
        <p className="muted small">Registering provisions you a TON deposit wallet automatically.</p>
      )}
    </div>
  );
}
