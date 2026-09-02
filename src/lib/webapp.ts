// ============================================================================
// Webapp connection contract (plan §2 layer 3 — scoped extension API tokens).
//
// The webapp issues revocable `zsy_…` tokens scoped ONLY to /api/sync/*.
// The extension never reuses the user's Supabase session or PIN — it stores
// { webappUrl, syncToken } in chrome.storage.local and calls the webapp like a
// plain REST client. Keys/credentials never live in content scripts.
// ============================================================================

export interface WebappConfig {
  webappUrl: string; // e.g. https://zonaed-ai-agent.vercel.app
  syncToken: string; // zsy_… issued by the webapp
}

const CONFIG_KEY = "webapp";

export function normalizeWebappUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/** Browser-valid token shape (matches the webapp's verifySyncTokenFormat). */
export function isSyncTokenShape(token: string): boolean {
  if (!token.startsWith("zsy_")) return false;
  // 32 random bytes base64url → 43 chars, all URL-safe.
  const body = token.slice(4);
  return body.length === 43 && /^[A-Za-z0-9_-]+$/.test(body);
}

export async function getWebappConfig(): Promise<WebappConfig | null> {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  const cfg = stored[CONFIG_KEY] as WebappConfig | undefined;
  if (!cfg?.webappUrl || !cfg?.syncToken) return null;
  return { webappUrl: normalizeWebappUrl(cfg.webappUrl), syncToken: cfg.syncToken };
}

export async function setWebappConfig(cfg: WebappConfig): Promise<void> {
  await chrome.storage.local.set({
    [CONFIG_KEY]: {
      webappUrl: normalizeWebappUrl(cfg.webappUrl),
      syncToken: cfg.syncToken,
    },
  });
}

/**
 * Call a webapp API path with the stored sync token attached. Throws when the
 * token is missing/invalid-shaped or the request fails (non-2xx → error text).
 */
export async function webappFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cfg = await getWebappConfig();
  if (!cfg) throw new Error("Webapp not configured. Open the options page to add your base URL and sync token.");
  if (!isSyncTokenShape(cfg.syncToken)) throw new Error("Stored sync token has an invalid shape.");

  const res = await fetch(`${cfg.webappUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.syncToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Webapp ${path} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export interface PullResponse {
  rows: Array<{ table: string; client_id: string; updated_at: string; deleted_at: string | null; [k: string]: unknown }>;
  watermark: string | null;
}

/** Pull changed rows since a watermark (same contract as the webapp's pull). */
export function pullFromWebapp(payload: { since?: string | null }): Promise<PullResponse> {
  return webappFetch<PullResponse>("/api/sync/pull", {
    method: "POST",
    body: JSON.stringify({ since: payload.since ?? null }),
  });
}

/** Validate the stored token against the webapp (options "Test connection"). */
export async function testWebappConnection(cfg: WebappConfig): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  try {
    const saved = await getWebappConfig();
    // Temporarily set the config under test so webappFetch attaches it.
    await setWebappConfig(cfg);
    const res = await webappFetch<PullResponse>("/api/sync/pull", {
      method: "POST",
      body: JSON.stringify({ since: null }),
    });
    const savedCfg = saved ?? { webappUrl: cfg.webappUrl, syncToken: cfg.syncToken };
    await setWebappConfig(savedCfg);
    return { ok: true, detail: `Connected — server returned ${res.rows.length} rows` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}