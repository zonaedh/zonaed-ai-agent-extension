// ============================================================================
// Structured scraping content script (E6).
//
// Listens for SCRAPE_RECIPE from the background worker and extracts records
// from the page using the recipe's row selector + per-field selectors.
// Returns an array of { fieldName: text } records. Never modifies the page.
// ============================================================================

import { parseTranscriptXml } from "../lib/scraper";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type === "SCRAPE_RECIPE") {
    const { recipe } = message as { recipe?: { rowSelector?: string; fields?: Record<string, string> } };
    handleScrape(recipe).then(sendResponse);
    return true;
  }
  if ((message as { type?: string } | null)?.type === "GET_YT_TRANSCRIPT") {
    void handleTranscript().then(sendResponse);
    return true;
  }
  return false;
});

async function handleScrape(
  recipe: { rowSelector?: string; fields?: Record<string, string> } | undefined,
): Promise<Array<Record<string, string>>> {
  if (!recipe?.rowSelector || !recipe.fields) return [];
  const rows = Array.from(document.querySelectorAll(recipe.rowSelector));
  const out: Array<Record<string, string>> = [];
  for (const row of rows.slice(0, 200)) {
    const record: Record<string, string> = {};
    for (const [field, selector] of Object.entries(recipe.fields)) {
      const node = row.querySelector(selector);
      record[field] = (node?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
    }
    out.push(record);
  }
  return out;
}

async function handleTranscript(): Promise<{ ok: boolean; transcript: string; error?: string }> {
  // Try ytInitialPlayerResponse → captions → timedtext URLs.
  try {
    const urls = currentCaptionUrls();
    if (urls.length === 0) return { ok: false, transcript: "", error: "No captions available" };
    const xml = await fetch(urls[0]).then((r) => r.text());
    return { ok: true, transcript: parseTranscriptXml(xml) };
  } catch (err) {
    return { ok: false, transcript: "", error: err instanceof Error ? err.message : String(err) };
  }
}

function currentCaptionUrls(): string[] {
  const win = window as unknown as { ytInitialPlayerResponse?: { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: Array<{ baseUrl: string }> } } } };
  const tracks = win.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  return tracks.map((t) => t.baseUrl).slice(0, 3);
}

console.debug("[Zonaed AI] E6 scraper loaded.");