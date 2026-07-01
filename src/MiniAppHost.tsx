import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PreparePreview, type User } from "./api";
import { CHANNEL, isEnvelope, type BridgeRequest, type BridgeResponse } from "./bridge/protocol";
import { ConsentModal, type ConsentDecision } from "./ConsentModal";

// MiniAppHost embeds a mini-app in an iframe and is the trusted shell behind the
// postMessage bridge. The mini-app requests context/prepare/pay; the host serves
// them, rendering the consent screen and performing the authenticated pay itself
// (the mini-app never sees the session or pays directly).
export function MiniAppHost({
  user,
  src,
  serviceId,
  onClose,
}: {
  user: User;
  src: string;
  serviceId: string;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // A pending consent request: the preview to show and the resolver to call.
  const [consent, setConsent] = useState<PreparePreview | null>(null);
  const consentResolve = useRef<((d: ConsentDecision) => void) | null>(null);
  // Encrypted user id, sealed to the service's key — computed on open so the
  // mini-app can hand it to its backend and learn a trusted user id.
  const encUserId = useRef<string>("");

  const askConsent = useCallback((preview: PreparePreview): Promise<ConsentDecision> => {
    return new Promise((resolve) => {
      consentResolve.current = resolve;
      setConsent(preview);
    });
  }, []);

  const onConsentDecision = (d: ConsentDecision) => {
    setConsent(null);
    consentResolve.current?.(d);
    consentResolve.current = null;
  };

  useEffect(() => {
    async function handle(req: BridgeRequest): Promise<unknown> {
      switch (req.type) {
        case "getContext":
          // encUserId is the trusted identity (only the service can decrypt it);
          // userId is a plaintext hint for UI only, not to be trusted for auth.
          return { userId: user.userId, encUserId: encUserId.current };
        case "prepare":
          return api.prepare(req.quote);
        case "pay": {
          // Trusted flow: show the shell's consent screen, then pay if approved.
          const preview = await api.prepare(req.quote);
          const decision = await askConsent(preview);
          if (!decision.approved) return null; // user cancelled
          return api.pay(req.quote, decision.walletId);
        }
      }
    }

    async function onMessage(ev: MessageEvent) {
      // Only accept messages from our iframe's window.
      if (frameRef.current && ev.source !== frameRef.current.contentWindow) return;
      if (!isEnvelope<BridgeRequest>(ev.data)) return;
      const req = ev.data.payload;

      let resp: BridgeResponse;
      try {
        resp = { id: req.id, ok: true, result: await handle(req) };
      } catch (err) {
        resp = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      frameRef.current?.contentWindow?.postMessage({ channel: CHANNEL, payload: resp }, "*");
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [user, askConsent]);

  // Prepare the encrypted user context BEFORE the iframe loads, so getContext can
  // hand it over immediately. The iframe mounts only once it is ready.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.openService(serviceId);
        if (cancelled) return;
        encUserId.current = r.encUserId;
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  return (
    <div className="host">
      <div className="host-bar">
        <button className="ghost" onClick={onClose}>
          ← Back to cabinet
        </button>
        <span className="muted small ellipsis">{src}</span>
      </div>
      {error && <div className="error">{error}</div>}
      {ready ? (
        <iframe ref={frameRef} className="host-frame" src={src} title="mini-app" />
      ) : (
        !error && <div className="center muted">Opening…</div>
      )}
      {consent && <ConsentModal preview={consent} onDecision={onConsentDecision} />}
    </div>
  );
}
