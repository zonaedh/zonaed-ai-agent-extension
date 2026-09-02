// ============================================================================
// WhatsApp Lead CRM & Auto-Responder (E2).
//
// Runs on web.whatsapp.com. Two responsibilities:
//   1. Chat-list observer — watches the left pane, extracts contact names
//      from each conversation row, and upserts a `LeadRow` per contact so the
//      user has a growing CRM captured from live interaction.
//   2. Manual-send-first reply suggests — a floating button above the message
//      input drafts a provider-generated reply (via the background worker +
//      user's LLM key) into the composer. The user presses Enter — NOTHING is
//      ever auto-sent.
//
// No provider keys here; messages are sent to the background worker only.
// ============================================================================

import { leadKey, nameFromListItemText, type LeadRow } from "../lib/crm";

// --- feature gate ----------------------------------------------------------
let enabled = false;
void chrome.runtime.sendMessage({ type: "GET_FEATURES" }).then((res: unknown) => {
  enabled = Boolean((res as { features?: { whatsappCrm?: boolean } } | null)?.features?.whatsappCrm);
  if (enabled) observeChatList();
});

// --- chat-list observer ----------------------------------------------------

const PANE_SELECTOR = "#pane-side";

function isLikelyContactRow(el: Element): boolean {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.length > 1 && aria.length < 400) return true;
  const txt = el.textContent ?? "";
  return txt.trim().length > 1 && txt.trim().length < 500;
}

function extractContactFromRow(row: Element): { name: string; snippet: string } {
  const frame = row.querySelector('[data-testid="cell-frame-container"]') ?? row;
  const aria = frame.getAttribute("aria-label") ?? "";
  const text = (aria || frame.textContent || "").replace(/^\s*\n/, "");
  const firstLine = aria.split(/\n/)[0] ?? "";
  const name = nameFromListItemText(aria || firstLine || text);
  const snippet = (text.split(/\n{2,}/)[1] ?? text.split(/\n/).slice(1).join(" ")).trim();
  return { name, snippet: snippet.slice(0, 200) };
}

function captureRows(): void {
  const pane = document.querySelector(PANE_SELECTOR);
  if (!pane) return;
  const rows = pane.querySelectorAll('[role="listitem"]');
  const now = new Date().toISOString();
  for (const row of Array.from(rows).slice(0, 50)) {
    if (!isLikelyContactRow(row)) continue;
    const { name, snippet } = extractContactFromRow(row);
    if (!name) continue;
    const lead: LeadRow = {
      id: leadKey(name),
      name,
      status: "new",
      lastMessage: snippet || undefined,
      lastActiveAt: now,
      notes: [],
      tags: [],
      createdAt: now,
      context: snippet || undefined,
    };
    void import("../lib/crm-store").then(({ upsertLead }) => upsertLead(lead));
  }
}

let observer: MutationObserver | null = null;
function observeChatList(): void {
  const pane = document.querySelector(PANE_SELECTOR);
  if (!pane || observer) return;
  observer = new MutationObserver(() => captureRows());
  observer.observe(pane, { childList: true, subtree: true });
  captureRows();
}
// --- floating "Suggest reply" ----------------------------------------------

function ensureSuggestButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>("#zonaed-suggest-reply");
  if (existing) return existing;
  if (!document.querySelector("footer") || !document.body) return null;

  const btn = document.createElement("button");
  btn.id = "zonaed-suggest-reply";
  btn.textContent = "✨ Suggest reply";
  btn.title = "Draft a reply suggestion (you press Send — never auto-sent)";
  Object.assign(btn.style, {
    position: "fixed",
    right: "16px",
    bottom: "120px",
    zIndex: "9999",
    background: "#128C7E",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    padding: "8px 12px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,.25)",
    fontFamily: "system-ui, sans-serif",
    display: "block",
  } as Partial<CSSStyleDeclaration>);

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Thinking…";
    void suggestReply().finally(() => {
      btn.disabled = false;
      btn.textContent = "✨ Suggest reply";
    });
  });

  document.body.appendChild(btn);
  return btn;
}

function findActiveChatName(): string {
  const header = document.querySelector('[data-testid="conversation-info-header"]');
  if (!header) return "the contact";
  const heading = header.querySelector('span[dir="auto"]');
  const name = (heading?.textContent ?? header.textContent ?? "").trim().split(/\n/)[0];
  return name.slice(0, 120) || "the contact";
}

async function suggestReply(): Promise<void> {
  const name = findActiveChatName();
  const textarea = document.querySelector<HTMLDivElement>('div[role="textbox"]');
  if (!textarea) return;
  const draft = textarea.textContent ?? "";

  const res = (await chrome.runtime.sendMessage({
    type: "GENERATE_REPLY",
    lead: { name, context: draft.slice(0, 1500) },
  })) as { ok?: boolean; text?: string } | null;
  if (!res?.ok) return;

  textarea.focus();
  document.execCommand("insertText", false, (res.text as string) ?? "");
}

// Watch for the chat footer (only appears when a conversation is open).
const layoutObserver = new MutationObserver(() => {
  if (enabled) ensureSuggestButton();
});
layoutObserver.observe(document.documentElement, { childList: true, subtree: true });

console.debug("[Zonaed AI] E2 WhatsApp CRM loaded.");