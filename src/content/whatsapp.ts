// ============================================================================
// WhatsApp CRM content script (E2 — scaffold placeholder).
//
// E2 will fill this in: chat-list DOM observer → lead rows → notes/tags →
// provider-routed reply suggestions (manual-send-first). Today it only proves
// the injection seam works (no-op on the page, no credentials touched).
// ============================================================================

// Feature gate from the background worker.
void chrome.runtime.sendMessage({ type: "GET_FEATURES" }).then((res: unknown) => {
  const features = (res as { features?: { whatsappCrm?: boolean } } | null)?.features;
  if (!features?.whatsappCrm) return;
  console.debug("[Zonaed AI] WhatsApp CRM enabled — E2 implementation pending.");
});