// ============================================================================
// WhatsApp Lead CRM (E2) — pure, testable lead-row logic.
//
// Lead rows are stored ONLY in chrome.storage.local under this extension's own
// store (the webapp sync tables don't include leads). This module stays DOM-
// free so it can be unit-tested; the content script (src/content/whatsapp.ts)
// supplies the extracted text, we own the shapes + helpers.
// ============================================================================

export type LeadStatus = "new" | "replied" | "closed";

export interface LeadRow {
  /** Stable per-contact key: normalized phone when known, else name lower. */
  id: string;
  name: string;
  phone?: string;
  status: LeadStatus;
  /** Short summary of the latest message from this contact. */
  lastMessage?: string;
  lastActiveAt: string; // ISO
  notes: string[];
  tags: string[];
  createdAt: string;
  /** Raw last interaction text (context for reply suggestions). */
  context?: string;
}

/** Normalize a contact key: digits-only phone, else name → lowercase. */
export function leadKey(name: string, phone?: string): string {
  if (phone) {
    const digits = phone.replace(/[^\d+]/g, "");
    if (digits.length >= 6) return `wa:${digits}`;
  }
  const base = name.trim().toLowerCase().replace(/\s+/g, " ");
  return `wa:${base || "unknown"}`;
}

/** Collapse multiple contact names to one human label. */
export function displayName(name: string, existing?: string): string {
  const clean = name.trim();
  if (!clean) return existing ?? "Unknown";
  return clean;
}

/** Extract a lead name from a chat-list row's aria-label/text (heuristics). */
export function nameFromListItemText(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  // WhatsApp list items: "Name\nlast message\ntime" — first line is the name.
  const firstLine = s.split(/\n/)[0] ?? "";
  const cleaned = firstLine
    .replace(/^\d{1,2}:\d{2}(\s?[APap][Mm])?/, "") // leading time
    .replace(/^[«(]/, "")
    .trim();
  return cleaned.slice(0, 120);
}

/** Build the reply-suggestion prompt sent to the provider (pure). */
export function buildReplyPrompt(lead: LeadRow, extraInstructions?: string): string {
  const ctx = lead.context ? `\nContext from the chat:\n${lead.context.slice(0, 1500)}` : "";
  const notes = lead.notes.length > 0 ? `\nNotes: ${lead.notes.join("; ")}` : "";
  const tags = lead.tags.length > 0 ? `\nTags: ${lead.tags.join(", ")}` : "";
  const instructions =
    (extraInstructions ?? "").trim().length > 0
      ? `\nExtra instructions: ${extraInstructions!.trim()}`
      : "";
  return (
    `You are helping reply to a WhatsApp contact named "${lead.name}".` +
    `Write ONE natural, concise reply (2-4 sentences) in the same language as the conversation.` +
    `Do not invent facts. Do not include a subject line.` +
    ctx +
    notes +
    tags +
    instructions +
    `\n\nReply:`
  );
}

/** Dedupe leads by key, newest interaction wins. */
export function dedupeLeads<T extends { id: string; lastActiveAt: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) {
    const cur = map.get(r.id);
    if (cur === undefined || Date.parse(r.lastActiveAt) > Date.parse(cur.lastActiveAt)) {
      map.set(r.id, r);
    }
  }
  return [...map.values()];
}

/** Counts per status (for a possible badge/summary). */
export function leadCounts(rows: LeadRow[]): Record<LeadStatus, number> {
  const out: Record<LeadStatus, number> = { new: 0, replied: 0, closed: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}