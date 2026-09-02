// ============================================================================
// CRM store — local persistence for WhatsApp leads (E2).
//
// Deliberately local-only: the webapp's sync tables (tasks/memory/etc.) don't
// include leads, so these rows never leave the device. Status/notes/tags are
// edited here and read by the WhatsApp content script.
// ============================================================================

import type { LeadRow } from "./crm";

const KEY = "crmLeads";

export async function listLeads(): Promise<LeadRow[]> {
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as LeadRow[] | undefined) ?? [];
}

export async function upsertLead(lead: LeadRow): Promise<void> {
  const rows = await listLeads();
  const idx = rows.findIndex((r) => r.id === lead.id);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...lead };
  else rows.push(lead);
  await chrome.storage.local.set({ [KEY]: rows });
}

export async function updateLead(id: string, patch: Partial<LeadRow>): Promise<void> {
  const rows = await listLeads();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  rows[idx] = { ...rows[idx], ...patch };
  await chrome.storage.local.set({ [KEY]: rows });
}

export async function addLeadNote(id: string, note: string): Promise<void> {
  const rows = await listLeads();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const trimmed = note.trim();
  if (!trimmed) return;
  rows[idx] = { ...rows[idx], notes: [...(rows[idx].notes ?? []), trimmed].slice(-50) };
  await chrome.storage.local.set({ [KEY]: rows });
}

export async function clearLeads(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}