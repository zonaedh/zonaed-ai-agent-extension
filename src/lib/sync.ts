// ============================================================================
// Extension sync engine (E1 — plan §2 layer 3 / §3).
//
// Contract parity with the webapp's Dexie↔Supabase engine:
//   * last-write-wins by `updated_at` (ms compare; RFC-3339 on both sides),
//   * deletes travel as tombstones (`deleted_at` set — never hard-deleted),
//   * per-table watermark = the newest `updated_at` seen from the server.
//
// Pure merge logic lives here (unit-testable); persistence uses
// chrome.storage.local (E2 swaps in Dexie for CRM rows without changing
// the merge semantics).
// ============================================================================

export type SyncRow = Record<string, unknown> & {
  client_id: string;
  updated_at: string;
  deleted_at?: string | null;
};

export interface SyncTableState {
  rows: Record<string, SyncRow>;
  /** Newest server `updated_at` already pulled (RFC-3339). */
  watermark: string | null;
}

/** Parse an RFC-3339 timestamp to epoch ms (invalid → 0, sorts oldest). */
export function tsMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Merge pulled server rows into the local map with LWW semantics.
 * A pulled row wins only when strictly newer than the local one; tombstones
 * participate like any row (their newer timestamp hides the older live row).
 * Returns the merged map plus the rows that actually changed locally.
 */
export function lwwApply(
  local: Record<string, SyncRow>,
  incoming: SyncRow[],
): { merged: Record<string, SyncRow>; changed: SyncRow[] } {
  const merged: Record<string, SyncRow> = { ...local };
  const changed: SyncRow[] = [];
  for (const row of incoming) {
    if (!row?.client_id || typeof row.updated_at !== "string") continue;
    const current = merged[row.client_id];
    if (current === undefined || tsMs(row.updated_at) > tsMs(current.updated_at)) {
      merged[row.client_id] = row;
      changed.push(row);
    }
  }
  return { merged, changed };
}

/**
 * Rows that must be pushed: locally-newer than the server copy. The caller
 * passes its local rows and the server's view (from a pull); rows missing on
 * the server always push. Tombstones push too (they must reach the server).
 */
export function rowsToPush(
  local: Record<string, SyncRow>,
  serverRows: SyncRow[],
): SyncRow[] {
  const serverMap = new Map(serverRows.map((r) => [r.client_id, r]));
  const out: SyncRow[] = [];
  for (const row of Object.values(local)) {
    const server = serverMap.get(row.client_id);
    if (server === undefined || tsMs(row.updated_at) > tsMs(server.updated_at)) out.push(row);
  }
  return out;
}

/** Advance the watermark: the max of the previous value and serverTime. */
export function bumpWatermark(prev: string | null, serverTime: string): string {
  return tsMs(serverTime) > tsMs(prev) ? serverTime : (prev ?? serverTime);
}

// --------------------------- storage (chrome) -------------------------------

const STATE_KEY = "syncState";
const SYNCABLE_TABLES = ["tasks", "memory", "knowledge", "chat_history", "skills", "examples"] as const;
export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

interface StoredSyncState {
  tables: Record<string, SyncTableState>;
  /** client_ids changed locally since the last successful push, per table. */
  dirty: Record<string, string[]>;
}

async function loadState(): Promise<StoredSyncState> {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return (stored[STATE_KEY] as StoredSyncState | undefined) ?? { tables: {}, dirty: {} };
}

async function saveState(state: StoredSyncState): Promise<void> {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export function tableState(state: StoredSyncState, table: string): SyncTableState {
  return state.tables[table] ?? { rows: {}, watermark: null };
}

/** Mark a local row changed — it will be pushed on the next runSync. */
export async function markDirty(table: string, clientId: string): Promise<void> {
  const state = await loadState();
  const list = new Set(state.dirty[table] ?? []);
  list.add(clientId);
  state.dirty[table] = [...list];
  await saveState(state);
}

/** Write a local row (upsert + dirty flag) — the E2 write path. */
export async function putLocalRow(table: string, row: SyncRow): Promise<void> {
  const state = await loadState();
  const ts = tableState(state, table);
  const current = ts.rows[row.client_id];
  if (current === undefined || tsMs(row.updated_at) >= tsMs(current.updated_at)) {
    ts.rows[row.client_id] = row;
  }
  state.tables[table] = ts;
  const list = new Set(state.dirty[table] ?? []);
  list.add(row.client_id);
  state.dirty[table] = [...list];
  await saveState(state);
}

/**
 * One full sync cycle for every syncable table: push locally-dirty rows →
 * pull → LWW-merge → advance watermarks. Throws on the first network/auth
 * failure (the caller surfaces it); state is only saved after a clean run.
 */
export async function runSync(): Promise<{ pulled: number; pushed: number; skipped: number }> {
  const { pullFromWebapp, pushToWebapp } = await import("./webapp");
  const state = await loadState();
  let pulled = 0;
  let pushed = 0;
  let skipped = 0;

  for (const table of SYNCABLE_TABLES) {
    const ts = tableState(state, table);

    // 1. Push locally-dirty rows (server applies LWW; stale → skipped).
    const dirtyIds = state.dirty[table] ?? [];
    if (dirtyIds.length > 0) {
      const rows = dirtyIds.map((id) => ts.rows[id]).filter((r): r is SyncRow => Boolean(r));
      if (rows.length > 0) {
        const pushRes = await pushToWebapp(table, rows);
        pushed += pushRes.applied;
        skipped += pushRes.skipped;
      }
      state.dirty[table] = [];
    }

    // 2. Pull server changes since the watermark and LWW-merge locally.
    const pullRes = await pullFromWebapp(table, ts.watermark);
    const applied = lwwApply(ts.rows, pullRes.rows as SyncRow[]);
    pulled += applied.changed.length;

    state.tables[table] = {
      rows: applied.merged,
      watermark: bumpWatermark(ts.watermark, pullRes.serverTime),
    };
  }

  await saveState(state);
  return { pulled, pushed, skipped };
}

/** Live row lookup for content scripts (tombstones filtered out). */
export async function getLiveRow(table: string, clientId: string): Promise<SyncRow | null> {
  const state = await loadState();
  const row = tableState(state, table).rows[clientId];
  if (!row || row.deleted_at) return null;
  return row;
}
