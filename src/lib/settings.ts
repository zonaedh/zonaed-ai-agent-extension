// ============================================================================
// Extension settings — shared by the options page and the background worker.
// Kept plain and dependency-free so every bundle stays small.
// ============================================================================

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
  /** Toggles per feature; true = on by default after first config. */
  features: {
    ghostwriter: boolean;
    pageWatcher: boolean;
    whatsappCrm: boolean;
  };
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