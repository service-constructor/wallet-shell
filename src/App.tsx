import { useCallback, useEffect, useState } from "react";
import { api, type Account, type App as AppInfo, type Currency, type User } from "./api";
import { AuthScreen } from "./AuthScreen";
import { Accounts } from "./Accounts";
import { MiniAppHost } from "./MiniAppHost";

// Fallback mini-app URL for a catalog entry that has no miniapp_url configured
// on the platform yet (older services). Real entries carry their own URL.
const FALLBACK_MINIAPP_URL = import.meta.env.VITE_MINIAPP_URL ?? "http://localhost:5180/";

// App is the cabinet shell: it resolves the session on mount, shows the auth
// screen when signed out, and the accounts dashboard when signed in. This shell
// is also where hosted mini-apps will mount (next step).
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // When set, this app is running full-screen in the host.
  const [openApp, setOpenApp] = useState<AppInfo | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts((await api.accounts()).accounts);
    } catch {
      /* balances are best-effort */
    }
  }, []);

  // Load the currency catalog (rarely changes) so accounts can be labelled.
  const loadCurrencies = useCallback(async () => {
    try {
      setCurrencies((await api.currencies()).currencies);
    } catch {
      /* catalog is best-effort; UI falls back to the raw currency id */
    }
  }, []);

  // Load the app catalog from the platform (all ACTIVE services).
  const loadApps = useCallback(async () => {
    try {
      setApps((await api.apps()).apps);
    } catch {
      /* catalog is best-effort */
    }
  }, []);

  // Resolve an existing session (cookie) on mount.
  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        setUser(user);
        await Promise.all([loadAccounts(), loadCurrencies(), loadApps()]);
      } catch {
        /* not signed in */
      } finally {
        setBooting(false);
      }
    })();
  }, [loadAccounts, loadCurrencies, loadApps]);

  const onAuthed = async (u: User) => {
    setError(null);
    setUser(u);
    await Promise.all([loadAccounts(), loadApps()]);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setAccounts([]);
    setCurrencies([]);
    setApps([]);
  };

  if (booting) return <div className="center muted">Loading…</div>;

  // A running mini-app takes over the viewport; the shell handles its bridge and
  // refreshes balances when it closes (a payment may have changed them).
  if (user && openApp) {
    return (
      <MiniAppHost
        user={user}
        src={openApp.miniappUrl || FALLBACK_MINIAPP_URL}
        serviceId={openApp.serviceId}
        onClose={() => {
          setOpenApp(null);
          void loadAccounts();
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="appbar">
        <span className="brand">🪪 Cabinet</span>
        {user && (
          <span className="row">
            <span className="muted">{user.login}</span>
            <button className="ghost" onClick={logout}>
              Sign out
            </button>
          </span>
        )}
      </header>

      <main className="content">
        {error && <div className="error">{error}</div>}
        {!user ? (
          <AuthScreen onAuthed={onAuthed} onError={setError} />
        ) : (
          <>
            <Accounts user={user} accounts={accounts} currencies={currencies} onRefresh={loadAccounts} />
            <section className="apps">
              <h2>Apps</h2>
              {apps.length === 0 ? (
                <div className="muted small">No apps available yet.</div>
              ) : (
                apps.map((app) => (
                  <div className="card app-tile" key={app.serviceId}>
                    <div>
                      <div className="strong">
                        {app.iconUrl || "🧩"} {app.name}
                      </div>
                      {app.description && <div className="muted small">{app.description}</div>}
                    </div>
                    <button className="primary" onClick={() => setOpenApp(app)}>
                      Open
                    </button>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
