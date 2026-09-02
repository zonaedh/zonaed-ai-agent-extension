// E5/E6 pure tests — page watcher + scraper + transcript parsing.
// Run: npx tsx tests/watcher-scraper.test.mts
import assert from "node:assert/strict";
import { applyCheck, hashText, htmlToText, normalizeWatchUrl, type WatchEntry } from "../src/lib/watcher";
import { parseTranscriptXml, recipeFor, rowsToCsv, type ScraperRecipe } from "../src/lib/scraper";

let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${passed} - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  url: "https://example.com",
  label: "Example",
  lastHash: null,
  lastCheckedAt: null,
  lastChangedAt: null,
  seeded: false,
  ...over,
});

check("watcher: normalizeWatchUrl upgrades bare domain + strips hash", () => {
  assert.equal(normalizeWatchUrl("example.com/page"), "https://example.com/page");
  assert.equal(normalizeWatchUrl("https://example.com/#frag"), "https://example.com"); // hash + trailing slash stripped
  assert.equal(normalizeWatchUrl("ftp://x"), null);
  assert.equal(normalizeWatchUrl("  "), null);
});

check("watcher: hashText stable + deterministic", () => {
  assert.equal(hashText("hello"), hashText("hello"));
  assert.notEqual(hashText("hello"), hashText("hellp"));
  assert.match(hashText("a"), /^[0-9a-f]{8}$/);
});

check("watcher: htmlToText strips scripts/styles/tags", () => {
  const html = "<script>alert(1)</script><style>.x{}</style><h1> Title </h1><p>Body &amp; text</p>";
  const text = htmlToText(html);
  assert.ok(!text.includes("<script>"));
  assert.ok(text.includes("Title"));
  assert.ok(text.includes("Body & text"));
});

check("watcher: first check seeds (no notification), then change fires", () => {
  const seeded = applyCheck(entry(), hashText("v1"), new Date("2026-01-02"));
  assert.equal(seeded.changed, false);
  assert.equal(seeded.entry.seeded, true);
  const changed = applyCheck(seeded.entry, hashText("v2"), new Date("2026-01-03"));
  assert.equal(changed.changed, true);
  assert.ok(changed.entry.lastChangedAt);
  const same = applyCheck(changed.entry, hashText("v2"), new Date("2026-01-04"));
  assert.equal(same.changed, false);
});

check("scraper: recipeFor matches by url substring", () => {
  const recipes: ScraperRecipe[] = [
    { id: "r1", name: "example", urlPattern: "example.com", rowSelector: "tr", fields: { t: "td" } },
  ];
  assert.equal(recipeFor("https://example.com/x", recipes)?.id, "r1");
  assert.equal(recipeFor("https://other.com/x", recipes), null);
});

check("scraper: rowsToCsv quotes commas + quotes + newlines", () => {
  const csv = rowsToCsv([{ a: "x", b: "has,comma" }, { a: 'he said "hi"', b: "line1\nline2" }]);
  assert.ok(csv.includes('"has,comma"'));
  assert.ok(csv.includes('"he said ""hi"""'));
  // header + row1 + quoted-value newline + row2 = 3 \n total
  assert.equal((csv.match(/\n/g) ?? []).length, 3);
});

check("scraper: parseTranscriptXml joins segments", () => {
  const xml = '<timedtext><text start="0" dur="1">Hello &amp; world.</text><text start="1.5">Next line.</text></timedtext>';
  const out = parseTranscriptXml(xml);
  assert.ok(out.includes("Hello & world."));
  assert.ok(out.includes("Next line."));
});

check("scraper: parseTranscriptXml strips tags in captions", () => {
  const xml = '<timedtext><text start="0" dur="1"><![CDATA[ok]]><font b="1">bold</font></text></timedtext>';
  const out = parseTranscriptXml(xml);
  assert.ok(!out.includes("<font"));
});

console.log(`\n${passed}/8 watcher/scraper checks passed`);
if (passed !== 8 || process.exitCode === 1) process.exit(1);