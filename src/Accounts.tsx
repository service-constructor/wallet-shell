import { useMemo, useState } from "react";
import { api, type Account, type Currency, type User } from "./api";

// Accounts shows the user's ledger accounts (one per currency) with live
// balances, the deposit address + memo tag, and a demo "simulate deposit"
// action. The simulate action stands in for an on-chain transfer landing and is
// only offered for test currencies (isReal=false) — real currencies are funded
// solely by the on-chain deposit watcher, so the auth service rejects a mock
// deposit for them.
export function Accounts({
  user,
  accounts,
  currencies,
  onRefresh,
}: {
  user: User;
  accounts: Account[];
  currencies: Currency[];
  onRefresh: () => Promise<void>;
}) {
  const [busyWallet, setBusyWallet] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Look up currency metadata by id so we can label accounts (DEV ◈ / GRAM) and
  // decide which are mock-fundable.
  const byId = useMemo(() => {
    const m = new Map<number, Currency>();
    for (const c of currencies) m.set(c.id, c);
    return m;
  }, [currencies]);

  // Simulate an on-chain deposit landing to this account's memo. ref must be
  // unique per deposit (idempotency) — we stamp it from the memo + a timestamp.
  const simulateDeposit = async (account: Account) => {
    setBusyWallet(account.walletId);
    setNote(null);
    try {
      const ref = `demo-${account.depositMemo}-${Math.floor(performance.now())}`;
      const r = await api.deposit(account.depositMemo, ref, "10.00", account.currencyId);
      setNote(r.applied ? "Deposited 10.00" : "Deposit already applied");
      await onRefresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyWallet(null);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <h2>Your accounts</h2>
        <button className="ghost" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      {note && <div className="ok">{note}</div>}

      {accounts.length === 0 && <p className="muted">No accounts yet.</p>}

      <div className="accounts">
        {accounts.map((a) => {
          const ccy = byId.get(a.currencyId);
          const label = ccy ? ccy.code : `cur #${a.currencyId}`;
          const symbol = ccy?.symbol;
          // Default unknown currencies to real (safer): hide the mock button
          // unless we positively know it's test money.
          const isTestMoney = ccy ? !ccy.isReal : false;
          const busy = busyWallet === a.walletId;

          return (
            <div key={a.walletId} className="card account">
              <div className="balrow">
                <span className="bal">{a.available}</span>
                <span className="ccy" title={ccy?.name ?? label}>
                  {symbol ? `${symbol} ${label}` : label}
                </span>
              </div>
              <div className="muted small">held: {a.held}</div>

              <div className="kv">
                <span className="k">Wallet</span>
                <span className="mono">{a.walletId}</span>
              </div>
              <div className="kv">
                <span className="k">Deposit address</span>
                <span className="mono ellipsis">{a.tonAddress}</span>
              </div>
              <div className="kv">
                <span className="k">Memo tag</span>
                <span className="mono">{a.depositMemo}</span>
              </div>

              {isTestMoney ? (
                <button className="primary" disabled={busy} onClick={() => void simulateDeposit(a)}>
                  {busy ? "…" : "Simulate deposit +10"}
                </button>
              ) : (
                <p className="muted small">
                  Send {label} to the deposit address with this memo tag to top up.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="muted small">Signed in as {user.login}.</p>
    </section>
  );
}
