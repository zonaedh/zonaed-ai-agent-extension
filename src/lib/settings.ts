// ============================================================================
// Extension settings — shared by the options page and the background worker.
// Kept plain and dependency-free so every bundle stays small.
// ============================================================================

import type { WatchEntry } from "./watcher";

// type WatchEntry is defined in ./watcher; re-export for consumers importing
// everything from settings.
export type { WatchEntry };

export interface ExtensionSettings {
  /** Webapp base URL + sync token (see lib/webapp.ts). */
  webappUrl: string;
  syncToken: string;
  /** Master toggle for conversational features (E3 ghostwriter, E4 autofill). */
  autofillEnabled: boolean;
  /** Optional LLM config for extension-generated replies (E2/E3/E6). */
  llm?: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  /** Autofill profile (E4) — filled into forms on explicit toolbar click. */
  profile?: {
    name: string;
    email: string;
    phone: string;
    company: string;
    website: string;
    address: string;
  };
  /** Page watcher (E5) — pinned URLs polled via chrome.alarms. */
  watchlist?: WatchEntry[];
  pageWatcherOn?: boolean;
  /** Structured scraping recipes (E6) — CSS selector sets per site. */
  recipes?: ScraperRecipe[];
  /** Toggles per feature; true = on by default after first config. */
  features: {
    ghostwriter: boolean;
    pageWatcher: boolean;
    whatsappCrm: boolean;
  };
}

/** One scraping recipe: which selectors to read on which site. */
export interface ScraperRecipe {
  id: string;
  name: string;
  /** Substring the tab URL must contain. */
  urlPattern: string;
  /** Row selector repeated per record + named field selectors. */
  rowSelector: string;
  fields: Record<string, string>;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  webappUrl: "",
  syncToken: "",
  autofillEnabled: false,
  llm: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "nvidia/nemotron-3-super-120b-a12b:free",
  },
  profile: { name: "", email: "", phone: "", company: "", website: "", address: "" },
  features: { ghostwriter: true, pageWatcher: false, whatsappCrm: true },
};

const KEY = "settings";

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEY);
  const s = stored[KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(s: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}