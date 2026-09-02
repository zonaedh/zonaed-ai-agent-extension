// ============================================================================
// YouTube Repurposing Studio (E6) content script.
//
// On watch pages, a floating button opens a modal that: reads the transcript
// via the background worker (SERVER-side ytInitialPlayerResponse captions) —
// actually we read it here from the live page, then asks the background to
// REPURPOSE it into blog outline + tweet thread + LinkedIn post.
// The repurposed content stays visible for copy (nothing is published).
// ============================================================================

import { parseTranscriptXml } from "../lib/scraper";

let transcript = "";

function captionUrls(): string[] {
  const win = window as unknown as {
    ytInitialPlayerResponse?: { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ baseUrl: string }> } } };
  };
  return (win.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
    .map((t) => t.baseUrl)
    .slice(0, 3);
}

async function loadTranscript(): Promise<string> {
  if (transcript) return transcript;
  const urls = captionUrls();
  if (urls.length === 0) throw new Error("No captions available on this video.");
  const xml = await fetch(urls[0]).then((r) => r.text());
  transcript = parseTranscriptXml(xml);
  return transcript;
}

// Floating button.
function ensureButton(): void {
  if (document.getElementById("zonaed-yt-repurpose")) return;
  const btn = document.createElement("button");
  btn.id = "zonaed-yt-repurpose";
  btn.textContent = "🎬 Repurpose";
  Object.assign(btn.style, {
    position: "fixed",
    right: "20px",
    bottom: "120px",
    zIndex: "2147483647",
    background: "#1f2328",
    color: "#fff",
    border: "none",
    borderRadius: "999px",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 2px 12px rgba(0,0,0,.25)",
    fontFamily: "system-ui, sans-serif",
  } as Partial<CSSStyleDeclaration>);
  btn.addEventListener("click", () => void openModal());
  document.body?.appendChild(btn);
}

function openModal(): void {
  document.getElementById("zonaed-yt-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "zonaed-yt-modal";
  Object.assign(modal.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    background: "rgba(0,0,0,.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  } as Partial<CSSStyleDeclaration>);

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    background: "#fff",
    color: "#1f2328",
    borderRadius: "14px",
    width: "min(640px, 92vw)",
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    padding: "18px",
    boxShadow: "0 20px 60px rgba(0,0,0,.4)",
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement("h3");
  title.textContent = "YouTube Repurpose";
  title.style.margin = "0 0 12px";
  panel.appendChild(title);

  const status = document.createElement("div");
  status.textContent = "Loading transcript…";
  status.style.fontSize = "13px";
  status.style.color = "#6b7280";
  panel.appendChild(status);

  const out = document.createElement("pre");
  out.style.cssText = "flex:1;overflow:auto;background:#0f172a;color:#e2e8f0;border-radius:10px;padding:12px;font-size:12px;white-space:pre-wrap;white-space:pre-wrap;display:none;";
  panel.appendChild(out);

  const copy = document.createElement("button");
  copy.textContent = "Copy";
  copy.style.cssText = "margin-top:12px;padding:8px 14px;border:0;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600;cursor:pointer;display:none;";
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(out.textContent ?? "");
  });
  panel.appendChild(copy);

  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.cssText = "margin-top:12px;margin-left:8px;padding:8px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#1f2328;cursor:pointer;";
  close.addEventListener("click", () => modal.remove());
  panel.appendChild(close);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal.appendChild(panel);
  document.body?.appendChild(modal);

  void (async () => {
    try {
      const text = await loadTranscript();
      status.textContent = `Transcript: ${text.length} chars. Repurposing…`;
      const res = (await chrome.runtime.sendMessage({ type: "REPURPOSE", transcript: text })) as
        | { ok?: boolean; text?: string; error?: string }
        | undefined;
      if (!res?.ok) throw new Error(res?.error ?? "Repurpose failed");
      status.style.display = "none";
      out.style.display = "block";
      out.textContent = res.text ?? "";
      copy.style.display = "inline-block";
    } catch (err) {
      status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  })();
}

// Attach on watch pages (url has watch or /shorts/).
if (location.pathname.startsWith("/watch") || location.pathname.startsWith("/shorts")) {
  const iv = setInterval(() => {
    if (document.body) {
      ensureButton();
      clearInterval(iv);
    }
  }, 1000);
}

console.debug("[Zonaed AI] E6 YouTube repurpose loaded.");