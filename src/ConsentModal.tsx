import { useState } from "react";
import type { PreparePreview } from "./api";

// ConsentModal is the trusted approval screen the SHELL renders (not the
// mini-app), so a service cannot alter what the user sees or approves. The user
// picks a wallet and confirms or cancels.
export type ConsentDecision = { approved: true; walletId: string } | { approved: false };

export function ConsentModal({
  preview,
  onDecision,
}: {
  preview: PreparePreview;
  onDecision: (d: ConsentDecision) => void;
}) {
  const [walletId, setWalletId] = useState(preview.wallets[0]?.walletId ?? "");

  return (
    <div className="modal-backdrop">
      <div className="card modal">
        <h3>Confirm payment</h3>
        <div className="pay-amount">
          {preview.amount} <span className="ccy">cur #{preview.currencyId}</span>
        </div>
        {preview.description && <p className="muted">{preview.description}</p>}

        {preview.wallets.length === 0 ? (
          <p className="error">No eligible wallet for this currency.</p>
        ) : (
          <label className="form">
            Pay from
            <select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
              {preview.wallets.map((w) => (
                <option key={w.walletId} value={w.walletId}>
                  {w.walletId}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="modal-actions">
          <button className="ghost" onClick={() => onDecision({ approved: false })}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!walletId}
            onClick={() => onDecision({ approved: true, walletId })}
          >
            Pay
          </button>
        </div>
      </div>
    </div>
  );
}
