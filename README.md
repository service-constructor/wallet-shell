# Cabinet

The **personal cabinet** for the Service Constructor demo: register / sign in,
see your accounts and balances, and top up a TON deposit wallet. It is also the
**wallet shell** that will host mini-apps (the SPA is structured so a hosted
mini-app mounts inside it — see Roadmap).

## Architecture

```
browser (React SPA, :5190)
   │  same-origin /api/*
   ▼
Cabinet BFF (Node/Express, :4200)   ← holds the session JWT in an httpOnly cookie
   │  Bearer JWT
   ▼
Auth service (:8090) ──gRPC──► Ledger (:9110)
```

The **BFF** is the trusted server side: it authenticates the user against the
[auth](../auth) service and keeps the session token in an **httpOnly cookie**, so
the SPA never handles the raw JWT. Every `/api` call the SPA makes is same-origin
and carries the cookie; the BFF attaches the bearer token when it calls auth.

Balances come from `auth /v1/auth/accounts`, which fans out to `ledger.GetBalance`
— so the cabinet reads accounts and balances through one door (auth), never
talking to the ledger directly.

There is **no device key / consent signing** in this design: actions are plain
authenticated calls gated by the session, like reading accounts.

## API (BFF)

| Method & path        | Auth   | Purpose                                    |
|----------------------|--------|--------------------------------------------|
| `POST /api/register` | none   | Register, set session cookie, return user  |
| `POST /api/login`    | none   | Sign in, set session cookie                |
| `POST /api/logout`   | cookie | Clear the session cookie                   |
| `GET  /api/me`       | cookie | Current user profile                       |
| `GET  /api/accounts` | cookie | Accounts with live balances (via auth→ledger) |
| `POST /api/deposit`  | cookie | Demo funding: credit own account by memo   |

## Run

Needs the ledger and auth services running (see their READMEs). Then:

```bash
npm install
# BFF (:4200) + Vite (:5190) together:
AUTH_BASE_URL=http://localhost:8090 npm run dev
# open http://localhost:5190
```

Config (env): `CABINET_PORT` (BFF, default `4200`), `AUTH_BASE_URL`
(default `http://localhost:8090`). Vite proxies `/api` → the BFF.

## Layout

```
index.html            SPA entry
src/App.tsx           shell: session gate → auth screen / accounts
src/AuthScreen.tsx    login / register
src/Accounts.tsx      accounts + balances + demo deposit
src/api.ts            same-origin BFF client (cookie session)
server/index.ts       BFF: auth-backed session, accounts, deposit
```

## Hosting mini-apps

The cabinet is the **wallet shell**: from the dashboard, "Open" launches a
mini-app in a full-screen **iframe** and the cabinet becomes the trusted host
behind a **postMessage** bridge (`src/MiniAppHost.tsx`, protocol in
`src/bridge/protocol.ts`). The mini-app never sees the session or pays directly —
it asks the shell:

- `getContext` → `{ userId }`
- `prepare(quote)` → consent preview (amount + eligible wallets, via the BFF)
- `pay(quote)` → the shell renders its **own consent screen**
  (`src/ConsentModal.tsx`) and, if approved, calls `POST /api/pay`

`POST /api/pay` calls the constructor's `/v1/services/pay` with the user's
session bearer and **no device-signed consent** — the platform runs
`CONSENT_MODE=none`, treating the authenticated session as the authorization.

The demo mini-app is the [example-miniapp](../example-miniapp), whose
`WalletBridge` now speaks postMessage to the parent shell (set `VITE_MINIAPP_URL`
to point elsewhere).

## Full demo (all services)

```
Ledger      :9110   (gRPC)
Auth        :8091   (HTTP)          AUTH_JWT_SECRET=devsecret, LEDGER_ADDR=localhost:9110
Constructor :8080   (HTTP)          CONSENT_MODE=none, EXECUTOR_MODE=http, AUTH_JWT_SECRET=devsecret
Cabinet BFF :4200                   AUTH_BASE_URL=http://localhost:8091, PLATFORM_BASE_URL=http://localhost:8080
Cabinet web :5190   (Vite)          → open this
example-service :4000
example-miniapp :5180  (Vite)        VITE_MINIAPP_URL default
```

Register in the cabinet → fund via "Simulate deposit" → Apps → Open → buy an
image: the shell shows the consent screen and pays over your session.
