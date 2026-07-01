// postMessage protocol between the cabinet shell (host) and a hosted mini-app
// (iframe). The mini-app sends requests; the shell replies with a matching id.
//
// This is the trusted boundary: the mini-app never sees the session token or
// performs payment itself. It asks the shell to pay, the shell shows a consent
// screen and calls the platform with the user's session.

export type BridgeRequest =
  | { id: string; type: "getContext" }
  | { id: string; type: "prepare"; quote: Quote }
  | { id: string; type: "pay"; quote: Quote; selectedWalletId: string };

export type BridgeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export type Quote = Record<string, unknown>;

// Wire message envelopes carry a channel marker so we ignore unrelated messages.
export const CHANNEL = "sc-wallet-bridge";

export interface Envelope<T> {
  channel: typeof CHANNEL;
  payload: T;
}

export function isEnvelope<T>(data: unknown): data is Envelope<T> {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === CHANNEL
  );
}
