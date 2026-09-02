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
  await saveSettings({
    ...s,
    webappUrl: cfg.webappUrl,
    syncToken: cfg.syncToken,
    autofillEnabled: $("autofillEnabled").checked,
    features: {
      whatsappCrm: $("whatsappCrm").checked,
      ghostwriter: $("ghostwriter").checked,
      pageWatcher: $("pageWatcher").checked,
    },
  });
  setStatus("Saved.", "ok");
});

void init();