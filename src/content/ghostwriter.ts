// ============================================================================
// Inline Ghostwriter Copilot (E3).
//
// Runs on ALL pages the user enables it for. A small floating badge appears
// beside the focused input/textarea/contenteditable; the user selects text and
// the badge offers Rewrite / Expand / Shorten. The result is generated in the
// background worker (options LLM config) and inserted on explicit approval —
// the badge never changes the field by itself.
// No provider keys in content scripts.
// ============================================================================

import { type EditMode } from "../lib/edit";

// --- feature gate ----------------------------------------------------------
let enabled = false;
void chrome.runtime.sendMessage({ type: "GET_FEATURES" }).then((res: unknown) => {
  enabled = Boolean((res as { features?: { ghostwriter?: boolean } } | null)?.features?.ghostwriter);
});

// --- shared DOM helpers ----------------------------------------------------

type Target = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function isEditable(el: unknown): el is Target {
  if (!(el instanceof Element)) return false;
  const tag = el.tagName;
  return (
    tag === "TEXTAREA" ||
    tag === "INPUT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

function insertInto(el: Target, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  el.focus();
  document.execCommand("insertText", false, text);
}

// --- floating badge + edit menu -------------------------------------------

const BADGE_ID = "zonaed-ai-ghostwriter";
let activeTarget: Target | null = null;

function attachTo(el: Target): void {
  activeTarget = el;
  document.getElementById(BADGE_ID)?.remove();

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.textContent = "✨";
  badge.title = "Zonaed AI — rewrite selection";
  Object.assign(badge.style, {
    position: "fixed",
    zIndex: "2147483647",
    background: "#4f46e5",
    color: "#fff",
    width: "26px",
    height: "26px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,.3)",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
  } as Partial<CSSStyleDeclaration>);

  const rect = el.getBoundingClientRect();
  badge.style.left = `${Math.max(4, rect.right + 4)}px`;
  badge.style.top = `${Math.max(4, rect.top - 12)}px`;

  badge.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const sel = window.getSelection()?.toString().trim() ?? "";
    if (!sel) return;
    showMenu(badge);
  });

  document.body?.appendChild(badge);
}

function showMenu(anchor: HTMLElement): void {
  anchor.remove();
  const menu = document.createElement("div");
  menu.id = BADGE_ID;
  Object.assign(menu.style, {
    position: "fixed",
    zIndex: "2147483647",
    background: "#fff",
    color: "#1f2328",
    borderRadius: "10px",
    boxShadow: "0 4px 20px rgba(0,0,0,.25)",
    padding: "6px",
    fontSize: "13px",
    fontFamily: "system-ui, sans-serif",
    border: "1px solid #e5e7eb",
  } as Partial<CSSStyleDeclaration>);
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(4, r.left)}px`;
  menu.style.top = `${Math.max(4, r.bottom + 4)}px`;

  const item = (label: string, mode: EditMode) => {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "6px 10px",
      border: "none",
      background: "transparent",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "13px",
    } as Partial<CSSStyleDeclaration>);
    b.addEventListener("mouseenter", () => (b.style.background = "#eef2ff"));
    b.addEventListener("mouseleave", () => (b.style.background = "transparent"));
    b.addEventListener("click", () => {
      menu.remove();
      void runEdit(mode);
    });
    return b;
  };

  menu.append(item("✍️ Rewrite", "rewrite"), item("🔍 Expand", "expand"), item("✂️ Shorten", "shorten"));
  document.body?.appendChild(menu);

  // Click-away closes the menu.
  setTimeout(() => {
    window.addEventListener("click", () => menu.remove(), { once: true, capture: true });
  }, 0);
}

async function runEdit(mode: EditMode): Promise<void> {
  const target = activeTarget;
  if (!target) return;
  const selected = (window.getSelection()?.toString() ?? "").trim();
  if (!selected) return;

  const res = (await chrome.runtime.sendMessage({
    type: "GHOSTWRITE",
    mode,
    text: selected.slice(0, 2000),
  })) as { ok?: boolean; text?: string } | null;
  if (!res?.ok || !res.text) return;
  insertInto(target, res.text);
}

// --- attach on focus / detach on blur --------------------------------------

document.addEventListener(
  "focusin",
  (ev) => {
    if (!enabled) return;
    if (isEditable(ev.target)) attachTo(ev.target);
  },
  true,
);

document.addEventListener(
  "focusout",
  () => {
    document.getElementById(BADGE_ID)?.remove();
    activeTarget = null;
  },
  true,
);

console.debug("[Zonaed AI] E3 Ghostwriter loaded.");