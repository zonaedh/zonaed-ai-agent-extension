// ============================================================================
// E1 live smoke: exercises the shared sync contract against the DEPLOYED
// webapp using a real zsy_ token (mint it in the webapp /settings page).
//
//   WEBAPP_URL=https://zonaed-ai-agent.vercel.app SYNC_TOKEN=zsy_… \
//     node scripts/smoke-sync.mjs
//
// Checks: pull (empty) → 200 · push → applied:1 · stale push → skipped:1 ·
// pull shows the winning row · tombstone push hides it · auth failures 401/403.
// Cleanup is contract-correct: the test row is tombstoned, never hard-deleted.
// ============================================================================
const baseUrl = (process.env.WEBAPP_URL ?? "").replace(/\/+$/, "");
const token = process.env.SYNC_TOKEN ?? "";
if (!baseUrl || !token.startsWith("zsy_")) {
  console.error("Usage: WEBAPP_URL=https://… SYNC_TOKEN=zsy_… node scripts/smoke-sync.mjs");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const clientId = `ext-smoke-${Date.now()}`;
const now = new Date().toISOString();

// 1) pull (empty watermark) → 200
const res1 = await fetch(`${baseUrl}/api/sync/pull?table=tasks`, { headers: authed });
const body1 = await res1.json();
check("pull → 200 with rows array", res1.status === 200 && Array.isArray(body1.rows), JSON.stringify(body1).slice(0, 120));

// 2) push → applied:1
const res2 = await fetch(`${baseUrl}/api/sync/push`, {
  method: "POST",
  headers: authed,
  body: JSON.stringify({ table: "tasks", rows: [{ client_id: clientId, title: "extension smoke", completed: false, updated_at: now }] }),
});
const body2 = await res2.json();
check("push → applied:1", res2.status === 200 && body2.applied === 1, JSON.stringify(body2));

// 3) stale push → skipped:1 (server-side LWW)
const stale = new Date(Date.parse(now) - 60_000).toISOString();
const res3 = await fetch(`${baseUrl}/api/sync/push`, {
  method: "POST",
  headers: authed,
  body: JSON.stringify({ table: "tasks", rows: [{ client_id: clientId, title: "STALE", completed: false, updated_at: stale }] }),
});
const body3 = await res3.json();
check("stale push → applied:0 skipped:1", res3.status === 200 && body3.applied === 0 && body3.skipped === 1, JSON.stringify(body3));

// 4) pull shows the winning row
const res4 = await fetch(`${baseUrl}/api/sync/pull?table=tasks&since=${encodeURIComponent(new Date(Date.parse(now) - 3_600_000).toISOString())}`, { headers: authed });
const body4 = await res4.json();
const row = (body4.rows ?? []).find((r) => r.client_id === clientId);
check("pull (since) shows winning row", res4.status === 200 && row?.title === "extension smoke", JSON.stringify(body4).slice(0, 160));

// 5) tombstone push (contract-correct delete)
const tomb = new Date(Date.parse(now) + 1_000).toISOString();
const res5 = await fetch(`${baseUrl}/api/sync/push`, {
  method: "POST",
  headers: authed,
  body: JSON.stringify({ table: "tasks", rows: [{ client_id: clientId, title: "extension smoke", completed: false, updated_at: tomb, deleted_at: tomb }] }),
});
const body5 = await res5.json();
check("tombstone push → applied:1", res5.status === 200 && body5.applied === 1, JSON.stringify(body5));
const res6 = await fetch(`${baseUrl}/api/sync/pull?table=tasks&since=${encodeURIComponent(now)}`, { headers: authed });
const body6 = await res6.json();
const tombRow = (body6.rows ?? []).find((r) => r.client_id === clientId);
check("pulled row carries deleted_at", res6.status === 200 && typeof tombRow?.deleted_at === "string", JSON.stringify(body6).slice(0, 160));

// 6) auth failures
const res7 = await fetch(`${baseUrl}/api/sync/pull?table=tasks`);
check("missing token → 401", res7.status === 401, String(res7.status));
const res8 = await fetch(`${baseUrl}/api/sync/pull?table=tasks`, { headers: { Authorization: "Bearer zsy_deadbeef" } });
check("garbage token → 403", res8.status === 403, String(res8.status));

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);