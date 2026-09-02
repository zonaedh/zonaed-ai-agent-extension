// ============================================================================
// Background service worker (MV3).
//
// Responsibilities today (E0): hold the options page config, react to install,
// and route messages from content scripts. Later phases add chrome.alarms
// (E5 page watcher), notification plumbing, and the provider-routing work.
// Provider keys NEVER live here or in content scripts — AI calls go through
// the webapp API wherever possible.
// ============================================================================

import { loadSettings } from "./lib/settings";
import { getWebappConfig } from "./lib/webapp";
import { buildReplyPrompt } from "./lib/crm";
import { complete, type LlmConfig } from "./lib/llm";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void loadSettings(); // prime chrome.storage with defaults
    void chrome.runtime.openOptionsPage();
  }
});

// Content scripts request feature toggles; the worker answers from storage.
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    const { type } = message as { type: string };
    if (type === "GET_FEATURES") {
      void loadSettings().then((s) => sendResponse({ features: s.features }));
      return true; // async response
    }
    if (type === "GET_WEBAPP_CONFIG") {
      void getWebappConfig().then((c) => sendResponse({ webappConfig: c }));
      return true;
    }
    if (type === "GENERATE_REPLY") {
      const { lead } = message as { lead?: { name?: string; context?: string } };
      void generateReply(lead?.name ?? "the contact", lead?.context ?? "")
        .then((text) => sendResponse({ ok: true, text }))
        .catch((err: unknown) =>
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      return true; // async response
    }
  }
  return false;
});

async function generateReply(name: string, context: string): Promise<string> {
  const s = await loadSettings();
  // E2 reply generation needs the user's LLM config (set in options). If there
  // is no key yet, fall back to a clearly-signed local draft (never a crash).
  if (!s.llm?.apiKey) {
    const fallbackMsgs = context ? `\n\nContext: ${context.slice(0, 300)}` : "";
    return `[Add an AI key in Zonaed AI options to generate this reply.]${fallbackMsgs}`;
  }
  const cfg: LlmConfig = { baseUrl: s.llm.baseUrl, apiKey: s.llm.apiKey, model: s.llm.model };
  const prompt = buildReplyPrompt({
    id: "wa:" + name.toLowerCase().replace(/\s+/g, " "),
    name,
    status: "new",
    lastActiveAt: new Date().toISOString(),
    notes: [],
    tags: [],
    createdAt: new Date().toISOString(),
    context,
  });
  return complete(cfg, [
    { role: "system", content: "You write short, natural WhatsApp replies. No preamble." },
    { role: "user", content: prompt },
  ]);
}

// Keep the worker from sleeping during long sync runs (later phases).
chrome.runtime.onSuspend?.addListener(() => {
  /* no-op — preserves lifecycle visibility during development */
});