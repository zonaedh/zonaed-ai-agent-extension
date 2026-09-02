// ============================================================================
// Background service worker (MV3).
//
// E0: options config + install handling + message routing.
// E2: GENERATE_REPLY (WhatsApp, manual-send-first).
// E3: GHOSTWRITE (selection rewrite/expand/shorten).
// E4: toolbar-click autofill.
// E5: chrome.alarms polling of the watchlist (change notifications).
// E6: SCRAPE_TAB (structured scraping recipes) + REPURPOSE (YouTube).
// Provider keys NEVER live in content scripts.
// ============================================================================

import { loadSettings, saveSettings, type ScraperRecipe, type WatchEntry } from "./lib/settings";
import { getWebappConfig } from "./lib/webapp";
import { buildReplyPrompt } from "./lib/crm";
import { buildEditPrompt, editSystemPrompt } from "./lib/edit";
import { complete, type LlmConfig } from "./lib/llm";
import { applyCheck, hashText, htmlToText } from "./lib/watcher";

const WATCH_ALARM = "zonaed-ai-watch";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void loadSettings();
    void chrome.runtime.openOptionsPage();
  }
  void refreshWatchAlarm();
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    void chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL_FORM" }).catch(() => undefined);
  }
});

async function refreshWatchAlarm(): Promise<void> {
  const s = await loadSettings();
  const on = Boolean(s.pageWatcherOn && (s.watchlist ?? []).length > 0);
  const existing = await chrome.alarms.get(WATCH_ALARM);
  if (on && !existing) {
    await chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 5 });
  } else if (!on && existing) {
    await chrome.alarms.clear(WATCH_ALARM);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCH_ALARM) void checkWatchlist();
});

async function checkWatchlist(): Promise<void> {
  const s = await loadSettings();
  if (!s.pageWatcherOn || !(s.watchlist ?? []).length) return;
  const next: WatchEntry[] = [];
  let changedCount = 0;
  for (const entry of s.watchlist ?? []) {
    try {
      const res = await fetch(entry.url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        next.push({ ...entry, lastCheckedAt: new Date().toISOString() });
        continue;
      }
      const html = await res.text();
      const hash = hashText(htmlToText(html));
      const outcome = applyCheck(entry, hash, new Date());
      next.push(outcome.entry);
      if (outcome.changed) {
        changedCount += 1;
        void chrome.notifications.create(`zonaed-watch-${entry.url}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "Zonaed AI - page changed",
          message: `${entry.label || entry.url} was updated.`,
        });
      }
    } catch {
      next.push({ ...entry, lastCheckedAt: new Date().toISOString() });
    }
  }
  await saveSettings({ ...s, watchlist: next });
  void chrome.storage.local.set({ lastWatchCheck: new Date().toISOString(), lastWatchChanges: changedCount });
}
// --- message routing -------------------------------------------------------

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message === "object" && message !== null && "type" in message) {
    const { type } = message as { type: string };
    switch (type) {
      case "GET_FEATURES": {
        void loadSettings().then((s) => sendResponse({ features: s.features }));
        return true;
      }
      case "GET_WEBAPP_CONFIG": {
        void getWebappConfig().then((c) => sendResponse({ webappConfig: c }));
        return true;
      }
      case "GENERATE_REPLY": {
        const { lead } = message as { lead?: { name?: string; context?: string } };
        void generateReply(lead?.name ?? "the contact", lead?.context ?? "")
          .then((text) => sendResponse({ ok: true, text }))
          .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }
      case "GHOSTWRITE": {
        const { mode, text } = message as { mode?: string; text?: string };
        void ghostwrite((mode ?? "rewrite") as "rewrite" | "expand" | "shorten", text ?? "")
          .then((out) => sendResponse({ ok: true, text: out }))
          .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }
      case "SCRAPE_TAB": {
        const { url, tabId } = message as { url?: string; tabId?: number };
        void loadSettings()
          .then((s) => {
            const recipe = (s.recipes ?? []).find((r) => url?.includes(r.urlPattern));
            if (tabId === undefined) throw new Error("No tab id");
            if (url?.includes("youtube.com")) return scrapeYouTubeTranscript(tabId);
            if (!recipe) throw new Error("No recipe matches this page - add one in Options.");
            return scrape(recipe, tabId);
          })
          .then((rows) => sendResponse({ ok: true, rows }))
          .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }
      case "REPURPOSE": {
        const { transcript } = message as { transcript?: string };
        void repurposeYouTube(transcript ?? "")
          .then((text) => sendResponse({ ok: true, text }))
          .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        return true;
      }
    }
  }
  return false;
});

async function generateReply(name: string, context: string): Promise<string> {
  const s = await loadSettings();
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

async function ghostwrite(mode: "rewrite" | "expand" | "shorten", text: string): Promise<string> {
  const s = await loadSettings();
  if (!s.llm?.apiKey) throw new Error("Add an AI key in Zonaed AI options first.");
  const cfg: LlmConfig = { baseUrl: s.llm.baseUrl, apiKey: s.llm.apiKey, model: s.llm.model };
  return complete(
    cfg,
    [
      { role: "system", content: editSystemPrompt() },
      { role: "user", content: buildEditPrompt(mode, text) },
    ],
    400,
  );
}

async function scrape(recipe: ScraperRecipe, tabId: number): Promise<Array<Record<string, string>>> {
  const out = (await chrome.tabs.sendMessage(tabId, {
    type: "SCRAPE_RECIPE",
    recipe: { rowSelector: recipe.rowSelector, fields: recipe.fields },
  })) as Array<Record<string, string>>;
  return Array.isArray(out) ? out : [];
}

async function scrapeYouTubeTranscript(tabId: number): Promise<Array<Record<string, string>>> {
  const data = (await chrome.tabs.sendMessage(tabId, { type: "GET_YT_TRANSCRIPT" })) as
    | { ok: boolean; transcript: string }
    | undefined;
  if (!data?.ok) throw new Error("No transcript found on this YouTube page.");
  return [{ transcript: data.transcript }];
}

async function repurposeYouTube(transcript: string): Promise<string> {
  const s = await loadSettings();
  if (!s.llm?.apiKey) throw new Error("Add an AI key in Zonaed AI options first.");
  const cfg: LlmConfig = { baseUrl: s.llm.baseUrl, apiKey: s.llm.apiKey, model: s.llm.model };
  return complete(
    cfg,
    [
      {
        role: "system",
        content:
          "You repurpose a YouTube transcript into creator content. Output ONLY the final piece, no preamble. Match the language of the transcript.",
      },
      {
        role: "user",
        content: `Turn the transcript into: (1) a blog-post outline, (2) a 3-tweet thread, (3) a LinkedIn post.\n\nTranscript:\n${transcript.slice(0, 12000)}`,
      },
    ],
    900,
  );
}
