import { useState } from "react";
import { api, type Account, type User } from "./api";

// Accounts shows the user's ledger accounts with live balances, the deposit
// address + memo tag, and a demo "simulate deposit" action (stands in for an
// on-chain transfer landing).
export function Accounts({
  user,
  accounts,
  onRefresh,
}: {
  user: User;
  accounts: Account[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Simulate an on-chain deposit landing to this user's memo. ref must be unique
  // per deposit (idempotency) — we stamp it from the account + a counter proxy.
  const simulateDeposit = async (memo: string) => {
    setBusy(true);
    setNote(null);
    try {
      const ref = `demo-${memo}-${accounts[0]?.available ?? "0"}-${Math.floor(performance.now())}`;
      const r = await api.deposit(memo, ref, "10.00");
      setNote(r.applied ? "Deposited 10.00" : "Deposit already applied");
      await onRefresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
        {accounts.map((a) => (
          <div key={a.walletId} className="card account">
            <div className="balrow">
              <span className="bal">{a.available}</span>
              <span className="ccy">cur #{a.currencyId}</span>
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

            <button className="primary" disabled={busy} onClick={() => simulateDeposit(a.depositMemo)}>
              {busy ? "…" : "Simulate deposit +10"}
            </button>
          </div>
        ))}
      </div>

      <p className="muted small">
        Signed in as {user.login}. Send TON to the deposit address with your memo tag to top up.
      </p>
    </section>
  );
}
