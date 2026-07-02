// Cabinet API client — talks to the same-origin BFF (/api/*). The session lives
// in an httpOnly cookie the BFF sets, so requests just need credentials.

export interface User {
  userId: string;
  login: string;
  tonAddress: string;
  depositMemo: string;
  walletId: string;
}

export interface Account {
  walletId: string;
  currencyId: number;
  tonAddress: string;
  depositMemo: string;
  available: string;
  held: string;
}

// Currency is one entry in the ledger's reference catalog, used to label
// accounts and tell test money (isReal=false, mock-fundable) from real money.
export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isReal: boolean;
}

// App is one entry in the shell's app list — the public ServiceInfo the
// platform returns for an ACTIVE service. Display fields may be empty; the UI
// falls back to defaults.
export interface App {
  serviceId: string;
  name: string;
  description?: string;
  iconUrl?: string;
  miniappUrl?: string;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `request failed: ${res.status}`);
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `request failed: ${res.status}`);
  return data as T;
}

export const api = {
  register: (login: string, password: string) =>
    post<{ user: User }>("/api/register", { login, password }),
  login: (login: string, password: string) =>
    post<{ user: User }>("/api/login", { login, password }),
  logout: () => post<{ ok: true }>("/api/logout"),
  me: () => get<{ user: User }>("/api/me"),
  accounts: () => get<{ accounts: Account[] }>("/api/accounts"),
  currencies: () => get<{ currencies: Currency[] }>("/api/currencies"),
  apps: () => get<{ apps: App[] }>("/api/apps"),
  deposit: (memo: string, ref: string, amount: string, currencyId: number) =>
    post<{ userId: string; applied: boolean }>("/api/deposit", { memo, ref, amount, currencyId }),
  prepare: (quote: unknown) => post<PreparePreview>("/api/prepare", { quote }),
  pay: (quote: unknown, selectedWalletId: string) =>
    post<PayResult>("/api/pay", { quote, selectedWalletId }),
  openService: (serviceId: string) =>
    post<{ serviceId: string; encUserId: string }>("/api/open-service", { serviceId }),
};

// PreparePreview is the consent-screen data the shell shows before paying.
export interface PreparePreview {
  amount: string;
  currencyId: number;
  description?: string;
  serviceId?: string;
  exp?: number;
  wallets: { walletId: string; currencyId: number }[];
}

// PayResult mirrors the platform order returned by /v1/services/pay.
export interface PayResult {
  orderId: string;
  state: string;
  externalRef?: string;
  amount?: string;
  fee?: string;
  net?: string;
}
