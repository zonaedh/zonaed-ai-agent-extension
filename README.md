# Zonaed AI Agent — Chrome Extension

Companion browser extension for the [Zonaed AI web app](https://github.com/zonaedh/zonaed-ai-agent).
Per the shared implementation plan this is a **separate repository** — it shares only the
webapp's `/api/sync/*` contract (Bearer `zsy_…` tokens) and never bundles webapp code.

## Scope (from the plan)

- **WhatsApp Lead CRM & Auto-Responder** (E2)
- **Inline Ghostwriter Copilot** (E3)
- **Form Autofill** (E4)
- **Scheduled Page Watcher** (E5)
- **OCR + Structured Scraping + YouTube Repurposing** (E6)

## Status

- **E0 — Scaffold (this commit):** MV3 TypeScript, esbuild build, ESLint, CI
  (build + typecheck + gitleaks secret-scan), options page with webapp
  connection + sync-token test, background service worker, WhatsApp content
  script seam.

## Dev

```bash
npm ci
npm run verify   # typecheck + lint + build
# load unpacked: chrome://extensions → Developer mode → "Load unpacked" → dist/
```

## Credentials model

- Webapp URL + `zsy_…` sync token live only in `chrome.storage.local`
  (set in the options page).
- No provider API keys are embedded in the extension. AI-assisted features
  call the webapp API with the sync token; provider routing/failover stays
  server-side in the webapp.