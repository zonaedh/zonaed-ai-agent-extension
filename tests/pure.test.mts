// Pure sync-logic tests (E1) — LWW merge, tombstones, watermark, push filter.
// Run: npm run test   (tsx runs TS directly; no chrome APIs touched here)
import assert from "node:assert/strict";
import { bumpWatermark, lwwApply, rowsToPush, tsMs, type SyncRow } from "../src/lib/sync";

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

const row = (client_id: string, updated_at: string, extra: Record<string, unknown> = {}): SyncRow => ({
  client_id,
  updated_at,
  ...extra,
} as SyncRow);
// @ts-expect-error — exercises the runtime guard for rows without updated_at
const badRows = [row("bad"), { client_id: "no-ts", foo: 1 }, null];

check("lwwApply: newer server row wins", () => {
  const local = { a: row("a", "2026-01-01T00:00:00Z", { title: "old" }) };
  const incoming = [row("a", "2026-01-02T00:00:00Z", { title: "new" })];
  const { merged, changed } = lwwApply(local, incoming);
  assert.equal(merged.a.title, "new");
  assert.equal(changed.length, 1);
});

check("lwwApply: older server row loses (changed empty)", () => {
  const local = { a: row("a", "2026-01-02T00:00:00Z", { title: "local" }) };
  const { merged, changed } = lwwApply(local, [row("a", "2026-01-01T00:00:00Z", { title: "server-old" })]);
  assert.equal(merged.a.title, "local");
  assert.equal(changed.length, 0);
});

check("lwwApply: equal timestamps → no change (idempotent)", () => {
  const local = { a: row("a", "2026-01-02T00:00:00Z", { title: "same" }) };
  const { changed } = lwwApply(local, [row("a", "2026-01-02T00:00:00Z")]);
  assert.equal(changed.length, 0);
});

check("lwwApply: tombstone (newer) hides live row", () => {
  const local = { a: row("a", "2026-01-01T00:00:00Z", { title: "live" }) };
  const { merged } = lwwApply(local, [row("a", "2026-01-02T00:00:00Z", { deleted_at: "2026-01-02T00:00:00Z" })]);
  assert.ok(typeof merged.a.deleted_at === "string");
});

check("lwwApply: invalid rows skipped", () => {
  const { merged, changed } = lwwApply({}, badRows as unknown as SyncRow[]);
  assert.equal(Object.keys(merged).length, 0);
  assert.equal(changed.length, 0);
});

check("rowsToPush: missing on server → push; older local → skip", () => {
  const local = {
    a: row("a", "2026-01-02T00:00:00Z"),
    b: row("b", "2026-01-01T00:00:00Z"),
    c: row("c", "2026-01-03T00:00:00Z"),
  };
  const server = [row("b", "2026-01-02T00:00:00Z")]; // server newer than local b
  const out = rowsToPush(local, server);
  assert.deepEqual(out.map((r) => r.client_id).sort(), ["a", "c"]);
});

check("rowsToPush: tombstoned local rows still push", () => {
  const local = { a: row("a", "2026-01-02T00:00:00Z", { deleted_at: "2026-01-02T00:00:00Z" }) };
  const out = rowsToPush(local, []);
  assert.equal(out.length, 1);
});

check("bumpWatermark: advances only forward", () => {
  assert.equal(bumpWatermark("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), "2026-01-02T00:00:00Z");
  assert.equal(bumpWatermark("2026-01-03T00:00:00Z", "2026-01-02T00:00:00Z"), "2026-01-03T00:00:00Z");
  assert.equal(bumpWatermark(null, "2026-01-02T00:00:00Z"), "2026-01-02T00:00:00Z");
});

check("tsMs: invalid → 0", () => {
  assert.equal(tsMs("not-a-date"), 0);
  assert.equal(tsMs(null), 0);
  assert.ok(tsMs("2026-01-02T00:00:00Z") > 0);
});

console.log(`\n${passed}/9 pure sync checks passed`);
if (passed !== 9 || process.exitCode === 1) process.exit(1);