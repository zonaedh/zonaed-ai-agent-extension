// ============================================================================
// Options page — webapp connection + feature toggles (E0).
// Never imports the webapp's code; only stores credentials in chrome.storage
// and probes the shared /api/sync contract.
// ============================================================================

import { loadSettings, saveSettings } from "../lib/settings";
import { isSyncTokenShape, normalizeWebappUrl, testWebappConnection, type WebappConfig } from "../lib/webapp";

function $(id: string): HTMLInputElement {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}
const status = $("status");

function setStatus(text: string, tone: "ok" | "err" | "" = ""): void {
  status.className = tone;
  status.textContent = text;
}

function currentConfig(): WebappConfig {
  return {
    webappUrl: normalizeWebappUrl($("webappUrl").value),
    syncToken: $("syncToken").value.trim(),
  };
}

async function init(): Promise<void> {
  const s = await loadSettings();
  $("webappUrl").value = s.webappUrl;
  $("syncToken").value = s.syncToken;
  $("autofillEnabled").checked = s.autofillEnabled;
  $("whatsappCrm").checked = s.features.whatsappCrm;
  $("ghostwriter").checked = s.features.ghostwriter;
  $("pageWatcher").checked = s.features.pageWatcher;
  $("pageWatcherOn").checked = Boolean(s.pageWatcherOn);
  $("llmBaseUrl").value = s.llm?.baseUrl ?? "";
  $("llmApiKey").value = s.llm?.apiKey ?? "";
  $("llmModel").value = s.llm?.model ?? "";
  const p = s.profile ?? { name: "", email: "", phone: "", company: "", website: "", address: "" };
  $("pfName").value = p.name;
  $("pfEmail").value = p.email;
  $("pfPhone").value = p.phone;
  $("pfCompany").value = p.company;
  $("pfWebsite").value = p.website;
  $("pfAddress").value = p.address;
  // Page watcher URLs (one per line).
  $("watchUrls").value = (s.watchlist ?? []).map((w) => w.url).join("\n");
  void refreshWatchStatus();
  // Recipes (JSON textarea).
  $("recipes").value = JSON.stringify(s.recipes ?? [], null, 2);
}

async function refreshWatchStatus(): Promise<void> {
  const stored = await chrome.storage.local.get("lastWatchCheck");
  const el = document.getElementById("watchStatus");
  if (!el) return;
  el.textContent = stored.lastWatchCheck ? `Last checked: ${stored.lastWatchCheck}` : "Not checked yet.";
  el.style.fontSize = "0.75rem";
  el.style.color = "#6b7280";
  el.style.marginTop = "0.3rem";
}

$("test").addEventListener("click", async () => {
  const cfg = currentConfig();
  if (!cfg.webappUrl.includes("://")) {
    setStatus("Enter a full base URL (https://…).", "err");
    return;
  }
  if (!isSyncTokenShape(cfg.syncToken)) {
    setStatus("Invalid sync token shape — expected a 43-char zsy_… token.", "err");
    return;
  }
  setStatus("Testing…");
  const result = await testWebappConnection(cfg);
  if (result.ok) setStatus(result.detail, "ok");
  else setStatus(`Connection failed: ${result.error}`, "err");
});

$("save").addEventListener("click", async () => {
  const cfg = currentConfig();
  const s = await loadSettings();
  const llmBaseUrl = $("llmBaseUrl").value.trim();
  const llmApiKey = $("llmApiKey").value.trim();
  const llmModel = $("llmModel").value.trim();

  // Page watcher URLs (one per line) → WatchEntry list.
  const watchlist = $("watchUrls").value
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((url) => {
      const existing = s.watchlist?.find((w) => w.url === url);
      return existing ?? { url, label: url, lastHash: null, lastCheckedAt: null, lastChangedAt: null, seeded: false };
    });

  // Recipes JSON — parse defensively.
  let recipes = s.recipes ?? [];
  try {
    const parsed = JSON.parse($("recipes").value || "[]") as Array<{ id: string; name?: string; urlPattern: string; rowSelector: string; fields: Record<string, string> }>;
    recipes = Array.isArray(parsed)
      ? parsed.map((r, i) => ({ id: r.id || `r${i + 1}`, name: r.name ?? r.urlPattern, urlPattern: r.urlPattern, rowSelector: r.rowSelector, fields: r.fields }))
      : [];
  } catch {
    /* keep existing recipes on bad JSON */
  }

  await saveSettings({
    ...s,
    webappUrl: cfg.webappUrl,
    syncToken: cfg.syncToken,
    autofillEnabled: $("autofillEnabled").checked,
    llm:
      llmBaseUrl || llmApiKey || llmModel
        ? { baseUrl: llmBaseUrl || "https://openrouter.ai/api/v1", apiKey: llmApiKey, model: llmModel || "nvidia/nemotron-3-super-120b-a12b:free" }
        : undefined,
    profile: {
      name: $("pfName").value.trim(),
      email: $("pfEmail").value.trim(),
      phone: $("pfPhone").value.trim(),
      company: $("pfCompany").value.trim(),
      website: $("pfWebsite").value.trim(),
      address: $("pfAddress").value.trim(),
    },
    watchlist,
    pageWatcherOn: $("pageWatcherOn").checked,
    recipes,
    features: {
      whatsappCrm: $("whatsappCrm").checked,
      ghostwriter: $("ghostwriter").checked,
      pageWatcher: $("pageWatcher").checked,
    },
  });
  setStatus("Saved.", "ok");
  void refreshWatchStatus();
});

void init();