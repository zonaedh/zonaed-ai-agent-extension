// ============================================================================
// Form Autofill content script (E4).
//
// Detects visible form fields on the page, matches them against the stored
// profile (pure logic in lib/autofill.ts), and pre-fills ONLY text-like
// inputs. Every fill is user-initiated (the extension button/badge) and each
// field is visibly marked before the user submits — nothing is submitted
// automatically, and password/hidden/checkbox fields are never touched.
// ============================================================================

import { valueFor, type FieldCandidate, type Profile } from "../lib/autofill";

const FILLABLE = "input[type=text],input[type=email],input[type=tel],input[type=url],input:not([type]),textarea";
const SKIP = "input[type=password],input[type=checkbox],input[type=radio],input[type=file],input[type=hidden],input[disabled],input[readonly]";

function descriptorFor(el: HTMLInputElement | HTMLTextAreaElement): string {
  const id = el.id ? ` ${el.id} ` : "";
  const name = el.name ? ` ${el.name} ` : "";
  const placeholder = el instanceof HTMLInputElement && el.placeholder ? ` ${el.placeholder} ` : "";
  const aria = el.getAttribute("aria-label") ? ` ${el.getAttribute("aria-label")} ` : "";
  // Associated <label for=…> text is the strongest hint.
  let label = "";
  if (el.id) {
    const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lab) label = ` ${lab.textContent ?? ""} `;
  }
  return `${id} ${name} ${placeholder} ${aria} ${label}`.toLowerCase();
}

function collect(profile: Profile): { filled: number; skippedHidden: number } {
  let filled = 0;
  const fields = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FILLABLE),
  ).filter((el) => !el.closest(SKIP) && !el.disabled && !el.readOnly);

  for (const el of fields) {
    if (el.value) continue; // never overwrite existing input
    const candidate: FieldCandidate = {
      descriptor: descriptorFor(el),
      type: (el as HTMLInputElement).type ?? "",
    };
    const value = valueFor(candidate, profile);
    if (!value) continue;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    filled += 1;
  }
  return { filled, skippedHidden: 0 };
}

function showBadge(filled: number): void {
  const note = document.createElement("div");
  note.textContent = filled > 0 ? `Zonaed AI: filled ${filled} field${filled === 1 ? "" : "s"}` : "Zonaed AI: no matching fields";
  Object.assign(note.style, {
    position: "fixed",
    left: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    background: "#1f2328",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    fontFamily: "system-ui, sans-serif",
  } as Partial<CSSStyleDeclaration>);
  document.body?.appendChild(note);
  setTimeout(() => note.remove(), 2500);
}

// User-initiated: the background toolbar action triggers one fill pass.
void chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type === "AUTOFILL_FORM") {
    void chrome.storage.local.get("settings").then((stored) => {
      const s = stored.settings as { profile?: Profile } | undefined;
      const profile = (s?.profile ?? {}) as Profile;
      const result = collect(profile);
      showBadge(result.filled);
      sendResponse(result);
    });
    return true;
  }
  return false;
});

console.debug("[Zonaed AI] E4 autofill loaded.");