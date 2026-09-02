// CRM (E2) pure tests — lead keys, name extraction, reply prompts, dedupe.
// Run: npx tsx tests/crm.test.mts
import assert from "node:assert/strict";
import { buildReplyPrompt, dedupeLeads, leadCounts, leadKey, nameFromListItemText } from "../src/lib/crm";

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

check("leadKey: phone normalizes to wa:digits", () => {
  assert.equal(leadKey("Rahim", "+1 (202) 555-0147"), "wa:+12025550147");
  assert.equal(leadKey("x", "8801712345678"), "wa:8801712345678");
});

check("leadKey: no phone → wa:lowercased name", () => {
  assert.equal(leadKey("  Shark Web  "), "wa:shark web");
});

check("leadKey: tiny phone falls back to name", () => {
  assert.equal(leadKey("A", "1234"), "wa:a");
});

check("nameFromListItemText: first line is name (strip leading time)", () => {
  assert.equal(nameFromListItemText("2:34 PM\nMessage here\nToday"), ""); // leading-only time → empty
  assert.equal(nameFromListItemText("Rahim\nWorking on it\n10:01"), "Rahim");
});

check("nameFromListItemText: empty → empty", () => {
  assert.equal(nameFromListItemText("   "), "");
  assert.equal(nameFromListItemText(""), "");
});

check("buildReplyPrompt: includes name, context, notes, tags, instructions", () => {
  const p = buildReplyPrompt(
    {
      id: "wa:rahim",
      name: "Rahim",
      status: "new",
      lastActiveAt: "2026-01-01T00:00:00Z",
      notes: ["wants a quote"],
      tags: ["warm"],
      createdAt: "2026-01-01T00:00:00Z",
      context: "Bhai rate koto?",
    },
    "Be friendly, mention the 20% launch discount.",
  );
  assert.ok(p.includes('named "Rahim"'));
  assert.ok(p.includes("Bhai rate koto?"));
  assert.ok(p.includes("wants a quote"));
  assert.ok(p.includes("warm"));
  assert.ok(p.includes("20% launch discount"));
  assert.ok(p.includes("Reply:"));
  assert.ok(!p.includes("Subject line"));
});

check("dedupeLeads: keeps newest per id", () => {
  const a = { id: "wa:x", lastActiveAt: "2026-01-01T00:00:00Z" } as const;
  const b = { id: "wa:x", lastActiveAt: "2026-01-02T00:00:00Z" } as const;
  const c = { id: "wa:y", lastActiveAt: "2025-12-01T00:00:00Z" } as const;
  const out = dedupeLeads([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === "wa:x")?.lastActiveAt, "2026-01-02T00:00:00Z");
});

check("leadCounts: aggregates status", () => {
  const rows = [
    { id: "1", name: "a", status: "new" },
    { id: "2", name: "b", status: "new" },
    { id: "3", name: "c", status: "replied" },
    { id: "4", name: "d", status: "closed" },
  ] as Array<Record<string, unknown> & { status: "new" | "replied" | "closed" }>;
  const counts = leadCounts(rows as unknown as Parameters<typeof leadCounts>[0]);
  assert.deepEqual(counts, { new: 2, replied: 1, closed: 1 });
});

console.log(`\n${passed}/8 CRM checks passed`);
if (passed !== 8 || process.exitCode === 1) process.exit(1);