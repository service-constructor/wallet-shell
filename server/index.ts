// Cabinet BFF (Backend-For-Frontend). It is the trusted server side of the
// personal cabinet: it authenticates the user against the auth service, keeps the
// session JWT in an httpOnly cookie (so the SPA never handles the raw token), and
// exposes a small same-origin API the SPA and hosted mini-apps call.
//
//   POST /api/register  { login, password }  -> set-cookie, { user }
//   POST /api/login     { login, password }  -> set-cookie, { user }
//   POST /api/logout                         -> clear cookie
//   GET  /api/me                             -> { user }        (auth: cookie)
//   GET  /api/accounts                       -> { accounts }    (auth: cookie)
//   POST /api/deposit   { memo, ref, amount } -> { applied }    (demo funding)
import express, { type Request, type Response } from "express";
import sodium from "libsodium-wrappers";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.CABINET_PORT ?? 4200);
const AUTH_BASE = process.env.AUTH_BASE_URL ?? "http://localhost:8090";
// The constructor platform the cabinet pays through (CONSENT_MODE=none, so the
// session is the authorization — no device-signed consent).
const PLATFORM_BASE = process.env.PLATFORM_BASE_URL ?? "http://localhost:8080";
const COOKIE = "sc_session";

const app = express();
app.use(express.json());

// --- tiny cookie helpers (no dependency) -----------------------------------
function setSession(res: Response, token: string) {
  // httpOnly so browser JS cannot read the token; Lax is fine same-site.
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`);
}
function clearSession(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}
function sessionToken(req: Request): string | null {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === COOKIE && v) return v;
  }
  return null;
}

// authFetch forwards a request to the auth service, attaching the session bearer.
async function authFetch(path: string, init: RequestInit, token?: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${AUTH_BASE}${path}`, { ...init, headers });
}

// --- auth flows -------------------------------------------------------------
async function registerOrLogin(kind: "register" | "login", req: Request, res: Response) {
  const { login, password } = req.body ?? {};
  if (!login || !password) return res.status(400).json({ error: "login and password required" });

  const upstream = await authFetch(`/v1/auth/${kind}`, {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
  const data = (await upstream.json()) as { token?: string; user?: unknown; message?: string };
  if (!upstream.ok || !data.token) {
    return res.status(upstream.status).json({ error: data.message ?? `${kind} failed` });
  }
  setSession(res, data.token);
  res.json({ user: data.user });
}

app.post("/api/register", (req, res) => void registerOrLogin("register", req, res));
app.post("/api/login", (req, res) => void registerOrLogin("login", req, res));
app.post("/api/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// --- authenticated reads ----------------------------------------------------
function requireSession(req: Request, res: Response): string | null {
  const token = sessionToken(req);
  if (!token) {
    res.status(401).json({ error: "not authenticated" });
    return null;
  }
  return token;
}

app.get("/api/me", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const upstream = await authFetch("/v1/auth/me", { method: "GET" }, token);
  const data = await upstream.json();
  res.status(upstream.status).json(upstream.ok ? { user: data } : { error: "unauthorized" });
});

app.get("/api/accounts", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const upstream = await authFetch("/v1/auth/accounts", { method: "GET" }, token);
  const data = (await upstream.json()) as { accounts?: unknown };
  res.status(upstream.status).json(upstream.ok ? { accounts: data.accounts ?? [] } : { error: "failed" });
});

// currencies is the reference catalog (id, code, symbol, is_real). The cabinet
// uses it to label accounts (DEV/GRAM) and to know which are mock-fundable.
app.get("/api/currencies", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const upstream = await authFetch("/v1/currencies", { method: "GET" }, token);
  const data = (await upstream.json()) as { currencies?: unknown };
  res.status(upstream.status).json(upstream.ok ? { currencies: data.currencies ?? [] } : { error: "failed" });
});

// Demo funding: credit the user's own account by its deposit memo. In production
// this is driven by an on-chain watcher, not the cabinet.
app.post("/api/deposit", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { memo, ref, amount, currencyId } = req.body ?? {};
  if (!memo || !ref || !amount) return res.status(400).json({ error: "memo, ref, amount required" });
  // Each account has its own memo AND currency; credit the currency the caller
  // named (default 1/DEV for back-compat). The auth service rejects a mock
  // deposit for a real currency, so this only ever funds test money.
  const upstream = await authFetch("/v1/auth/deposits", {
    method: "POST",
    body: JSON.stringify({ memo, ref, amount, currencyId: Number(currencyId ?? 1) }),
  }, token);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
});

// prepare returns the consent preview for a quote: amount, currency, and the
// user's eligible wallets. The cabinet shell shows this before the user approves.
app.post("/api/prepare", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const quote = req.body?.quote;
  if (!quote) return res.status(400).json({ error: "quote is required" });

  // Eligible accounts: those whose currency matches the quote currency.
  const upstream = await authFetch("/v1/auth/accounts", { method: "GET" }, token);
  const data = (await upstream.json()) as { accounts?: Array<{ walletId: string; currencyId: string }> };
  if (!upstream.ok) return res.status(upstream.status).json({ error: "accounts lookup failed" });
  const eligible = (data.accounts ?? []).filter((a) => Number(a.currencyId) === Number(quote.currencyId));

  res.json({
    amount: quote.amount,
    currencyId: Number(quote.currencyId),
    description: quote.description,
    serviceId: quote.serviceId,
    exp: quote.exp,
    wallets: eligible.map((a) => ({ walletId: a.walletId, currencyId: Number(a.currencyId) })),
  });
});

// pay runs the payment: the cabinet trusts the session (no device consent) and
// calls the constructor with the user's bearer token. This is the shell's
// authenticated "pay" the hosted mini-app cannot perform itself.
app.post("/api/pay", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const { quote, selectedWalletId } = req.body ?? {};
  if (!quote || !selectedWalletId) return res.status(400).json({ error: "quote and selectedWalletId required" });

  const payReq = {
    quote,
    selectedWalletId,
    selectedWalletCurrencyId: String(quote.currencyId),
    // consent omitted: the platform runs CONSENT_MODE=none for the cabinet.
  };
  const upstream = await fetch(`${PLATFORM_BASE}/v1/services/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payReq),
  });
  const order = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(order);
});

// apps returns the platform's public catalog of ACTIVE services so the shell
// can render its app list (no hardcoding). The platform exposes this to any
// authenticated user and returns no secrets — just the public ServiceInfo view.
app.get("/api/apps", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const upstream = await fetch(`${PLATFORM_BASE}/v1/services`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await upstream.json().catch(() => ({}))) as { services?: unknown };
  if (!upstream.ok) return res.status(upstream.status).json({ error: "catalog lookup failed" });
  res.json({ apps: data.services ?? [] });
});

// openService prepares an encrypted user context for launching a mini-app. It
// fetches the service's X25519 public key from the platform, then sealed-box
// encrypts the authenticated user's id: only the service (holding the private
// key) can decrypt it, so the mini-app learns a user id it can trust and that
// nobody in between could forge or read. Returns the ciphertext (base64).
app.post("/api/open-service", async (req, res) => {
  const token = requireSession(req, res);
  if (!token) return;
  const serviceId = req.body?.serviceId as string | undefined;
  if (!serviceId) return res.status(400).json({ error: "serviceId is required" });

  // 1. Who is the user (authoritative, from the session)?
  const meRes = await authFetch("/v1/auth/me", { method: "GET" }, token);
  const me = (await meRes.json()) as { userId?: string };
  if (!meRes.ok || !me.userId) return res.status(401).json({ error: "not authenticated" });

  // 2. The service's public encryption key, from the platform.
  const infoRes = await fetch(`${PLATFORM_BASE}/v1/services/${encodeURIComponent(serviceId)}/info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = (await infoRes.json()) as { encryptionPublicKey?: string };
  if (!infoRes.ok) return res.status(infoRes.status).json({ error: "service lookup failed" });
  if (!info.encryptionPublicKey) {
    return res.status(400).json({ error: "service has no encryption key configured" });
  }

  // 3. Sealed-box encrypt the user id to the service's public key.
  await sodium.ready;
  const pub = sodium.from_base64(info.encryptionPublicKey, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(me.userId), pub);
  const encUserId = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);

  res.json({ serviceId, encUserId });
});

// In production (single-container deploy) the BFF also serves the built SPA so
// /api/* and the static assets are same-origin. In dev this stays off and Vite
// serves the SPA, proxying /api to this BFF. Enable with SERVE_STATIC=1.
if (process.env.SERVE_STATIC === "1") {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const dist = process.env.STATIC_DIR ?? path.resolve(dir, "../dist");
  app.use(express.static(dist));
  // SPA fallback: any non-/api GET returns index.html.
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
  console.log(`serving static SPA from ${dist}`);
}

app.listen(PORT, () => {
  console.log(`cabinet BFF listening on :${PORT} (auth=${AUTH_BASE}, platform=${PLATFORM_BASE})`);
});
