// ============================================================================
// Structured scraping (E6) — pure recipe matching + CSV export.
// ============================================================================

export interface ScraperRecipe {
  id: string;
  name: string;
  /** Substring the tab URL must contain. */
  urlPattern: string;
  /** Row selector repeated per record + named field selectors. */
  rowSelector: string;
  fields: Record<string, string>;
}

/** The recipe matching this URL, or null. */
export function recipeFor(url: string, recipes: ScraperRecipe[]): ScraperRecipe | null {
  return recipes.find((r) => r.urlPattern && url.includes(r.urlPattern)) ?? null;
}

/** Rows (arrays of cell strings) → RFC-4180-ish CSV. */
export function rowsToCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h] ?? "")).join(","));
  return lines.join("\n");
}

/** Parse transcript XML (YouTube timedtext) → plain text lines. */
export function parseTranscriptXml(xml: string): string {
  const texts: string[] = [];
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (raw) texts.push(raw);
  }
  return texts.join(" ");
}