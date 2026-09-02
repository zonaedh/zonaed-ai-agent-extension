// ============================================================================
// Ghostwriter (E3) — pure prompt builders for selection edits.
// DOM-free and unit-testable; the content script supplies the selected text.
// ============================================================================

export type EditMode = "rewrite" | "expand" | "shorten";

const INSTRUCTIONS: Record<EditMode, string> = {
  rewrite: "Rewrite the text so it is clearer and more natural. Keep the meaning and language.",
  expand: "Expand the text with the missing useful detail (2-3x length). Keep the same tone and language.",
  shorten: "Shorten the text to the essential points (about half the length). Keep the same tone and language.",
};

/** System prompt shared by all edit modes (mirrors the webapp anti-cliché rules). */
export function editSystemPrompt(): string {
  return (
    "You edit user-supplied text. Output ONLY the edited text — no preamble, no quotes, no explanation. " +
    "Match the input language (English/Bangla/Banglish). " +
    "Never use em/en dashes. Never use the words: delve, testament, tapestry, embark, furthermore, moreover, beacon, game-changer."
  );
}

/** User prompt for a given edit mode + selection. */
export function buildEditPrompt(mode: EditMode, text: string): string {
  return `${INSTRUCTIONS[mode]}\n\nText:\n${text}`;
}