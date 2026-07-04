import { useMemo } from "react";
import { type App as AppInfo, type Currency, type Order } from "./api";

// Human-readable label + badge tint for each platform OrderState. Unknown
// states fall back to a neutral badge showing the raw value.
const STATE_META: Record<string, { label: string; tone: "ok" | "err" | "pending" | "" }> = {
  ORDER_STATE_CREATED: { label: "Created", tone: "" },
  ORDER_STATE_FROZEN: { label: "Frozen", tone: "pending" },
  ORDER_STATE_EXECUTING: { label: "Executing", tone: "pending" },
  ORDER_STATE_PENDING: { label: "Pending", tone: "pending" },
  ORDER_STATE_EXECUTED: { label: "Executed", tone: "pending" },
  ORDER_STATE_COMPLETED: { label: "Completed", tone: "ok" },
  ORDER_STATE_REJECTED: { label: "Rejected", tone: "err" },
  ORDER_STATE_FAILED: { label: "Failed", tone: "err" },
  ORDER_STATE_RELEASED: { label: "Refunded", tone: "err" },
};

function stateMeta(state: string) {
  return STATE_META[state] ?? { label: state.replace(/^ORDER_STATE_/, "") || "Unknown", tone: "" as const };
}

// Format an RFC3339 timestamp (protojson emits e.g. "2026-07-03T10:04:05Z") to a
// short local string; returns "" if absent/unparseable.
function fmtDate(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString();
}

// Orders is the "My orders" view: every order the user has placed across all
// mini-apps, newest first. Orders carry only a serviceId, so we join against the
// app catalog (apps) to show each mini-app's name and icon, and against the
// currency catalog to label amounts.
export function Orders({
  orders,
  apps,
  currencies,
  onRefresh,
}: {
  orders: Order[];
  apps: AppInfo[];
  currencies: Currency[];
  onRefresh: () => Promise<void>;
}) {
  const appById = useMemo(() => {
    const m = new Map<string, AppInfo>();
    for (const a of apps) m.set(a.serviceId, a);
    return m;
  }, [apps]);

  const ccyById = useMemo(() => {
    const m = new Map<number, Currency>();
    for (const c of currencies) m.set(c.id, c);
    return m;
  }, [currencies]);

  const ccyLabel = (id?: number): string => {
    if (id == null) return "";
    const c = ccyById.get(id);
    if (!c) return `cur #${id}`;
    return c.symbol ? `${c.symbol} ${c.code}` : c.code;
  };

  return (
    <section>
      <div className="toolbar">
        <h2>My orders</h2>
        <button className="ghost" onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="muted">No orders yet. Open an app to make your first purchase.</p>
      ) : (
        <div className="orders">
          {orders.map((o) => {
            const app = appById.get(o.serviceId);
            const name = app?.name || o.serviceId;
            const icon = app?.iconUrl || "🧩";
            const { label, tone } = stateMeta(o.state);
            const when = fmtDate(o.createdAt);

            return (
              <div key={o.orderId} className="card">
                <div className="order-head">
                  <div className="order-app">
                    <span className="order-icon">{icon}</span>
                    <span className="order-app-name" title={name}>
                      {name}
                    </span>
                  </div>
                  <span className={tone ? `badge ${tone}` : "badge"}>{label}</span>
                </div>

                {o.amount && (
                  <div className="kv">
                    <span className="k">Amount</span>
                    <span className="order-amount">
                      {o.amount} {ccyLabel(o.currencyId)}
                    </span>
                  </div>
                )}
                <div className="kv">
                  <span className="k">Order</span>
                  <span className="mono ellipsis">{o.orderId}</span>
                </div>
                {o.externalRef && (
                  <div className="kv">
                    <span className="k">Reference</span>
                    <span className="mono ellipsis">{o.externalRef}</span>
                  </div>
                )}
                {when && (
                  <div className="kv">
                    <span className="k">Placed</span>
                    <span className="muted small">{when}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
