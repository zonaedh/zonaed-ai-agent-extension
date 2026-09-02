// ============================================================================
// Form Autofill (E4) — pure field-matching logic.
//
// Maps a user profile (stored in the options page) onto common form fields by
// name/id/placeholder/label heuristics. DOM-free and unit-testable; the
// content script (src/content/autofill.ts) supplies candidate fields.
// ============================================================================

export interface Profile {
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  address: string;
}

export const EMPTY_PROFILE: Profile = {
  name: "",
  email: "",
  phone: "",
  company: "",
  website: "",
  address: "",
};

export type ProfileField = keyof Profile;

/** Which profile value best matches a field descriptor (all lowercase). */
export function matchField(descriptor: string): ProfileField | null {
  const d = descriptor.toLowerCase();
  // Order matters — most specific first.
  if (/(^|[^a-z])(e-?mail|mail)([^a-z]|$)/.test(d)) return "email";
  if (/(phone|mobile|cell|whatsapp|tel\b|contact number)/.test(d)) return "phone";
  if (/(website|url|domain|site)/.test(d)) return "website";
  if (/(company|business|organization|organisation|agency|brand)/.test(d)) return "company";
  if (/(address|street|location)/.test(d)) return "address";
  if (/(full[\s_-]?name|your name|^name$|first[\s_-]?and[\s_-]?last)/.test(d)) return "name";
  if (/(first[\s_-]?name|given name)/.test(d)) return "name";
  if (/(last[\s_-]?name|surname|family name)/.test(d)) return null; // ambiguous — skip
  if (/\bname\b/.test(d)) return "name";
  return null;
}

/** A candidate field discovered in the DOM (descriptor = joined hints). */
export interface FieldCandidate {
  /** name + id + placeholder + aria-label + label text, joined for matching. */
  descriptor: string;
  type: string;
}

/** Pick the profile value for a candidate (null = don't fill). */
export function valueFor(candidate: FieldCandidate, profile: Profile): string | null {
  if (candidate.type && /^(email)$/.test(candidate.type)) return profile.email || null;
  if (candidate.type && /^(tel|phone)$/.test(candidate.type)) return profile.phone || null;
  if (candidate.type && /^(url)$/.test(candidate.type)) return profile.website || null;
  const field = matchField(candidate.descriptor);
  if (!field) return null;
  const value = profile[field];
  return value ? value : null;
}

/** Serialize the profile as fillable text for the LLM fallback (free-form). */
export function profileSummary(profile: Profile): string {
  return Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}