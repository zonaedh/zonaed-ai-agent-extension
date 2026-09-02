// ============================================================================
// Scheduled Page Watcher (E5) — pure logic.
//
// The user pins URLs in the options page; a chrome.alarms poll re-fetches each
// page, hashes the visible text, and notifies when the hash changes. DOM-free
// and unit-testable; the background worker supplies fetch + storage.
// ============================================================================

export interface WatchEntry {
  url: string;
  label: string;
  /** Hash of the last seen content (null = never checked). */
  lastHash: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  /** Notifications fire only when changed; suppressed on the first check. */
  seeded: boolean;
}

/** Normalize a user-entered URL: https upgrade, strip hash/trailing slash. */
export function normalizeWatchUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject any non-http(s) scheme (ftp://, javascript:, …) before upgrading.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.origin + u.pathname.replace(/\/+$/, "") + (u.search || "");
  } catch {
    return null;
  }
}

/** Origin pattern for an optional-permission request (MV3 dynamic origins). */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

/** FNV-1a hash of the extracted text — stable, fast, dependency-free. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Strip scripts/styles/tags + collapse whitespace — "visible-ish" text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CheckOutcome {
  entry: WatchEntry;
  changed: boolean;
  error?: string;
}

/** Pure diff step: given the new hash, update the entry + flag change. */
export function applyCheck(entry: WatchEntry, newHash: string, now: Date): CheckOutcome {
  const next: WatchEntry = { ...entry, lastHash: newHash, lastCheckedAt: now.toISOString() };
  if (!entry.seeded) {
    // First observation only seeds the baseline — no notification.
    next.seeded = true;
    return { entry: next, changed: false };
  }
  if (entry.lastHash !== newHash) {
    next.lastChangedAt = now.toISOString();
    return { entry: next, changed: true };
  }
  return { entry: next, changed: false };
}