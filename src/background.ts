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
  }
  return false;
});

// Keep the worker from sleeping during long sync runs (later phases).
chrome.runtime.onSuspend?.addListener(() => {
  /* no-op — preserves lifecycle visibility during development */
});