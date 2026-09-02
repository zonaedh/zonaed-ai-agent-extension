// E3/E4 pure tests — ghostwriter prompts + autofill field matching.
// Run: npx tsx tests/edit-autofill.test.mts
import assert from "node:assert/strict";
import { buildEditPrompt, editSystemPrompt, type EditMode } from "../src/lib/edit";
import { matchField, profileSummary, valueFor, EMPTY_PROFILE, type FieldCandidate } from "../src/lib/autofill";

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

check("edit: prompt includes mode instruction + text", () => {
  const p = buildEditPrompt("shorten", "This is a long paragraph about pricing");
  assert.ok(p.includes("Shorten"));
  assert.ok(p.includes("This is a long paragraph about pricing"));
});

check("edit: all three modes produce distinct instructions", () => {
  const modes: EditMode[] = ["rewrite", "expand", "shorten"];
  const prompts = modes.map((m) => buildEditPrompt(m, "x"));
  assert.equal(new Set(prompts).size, 3);
});

check("edit: system prompt bans clichés + dashes", () => {
  const s = editSystemPrompt();
  assert.ok(s.includes("delve"));
  assert.ok(s.includes("dashes"));
  assert.ok(s.includes("ONLY the edited text"));
});

check("autofill: email field", () => {
  assert.equal(matchField(" your email address "), "email");
  assert.equal(matchField("e-mail"), "email");
});

check("autofill: phone variants", () => {
  assert.equal(matchField("mobile number"), "phone");
  assert.equal(matchField("whatsapp"), "phone");
  assert.equal(matchField("contact number"), "phone");
});

check("autofill: company/website/address/name", () => {
  assert.equal(matchField("company name"), "company");
  assert.equal(matchField("website url"), "website");
  assert.equal(matchField("street address"), "address");
  assert.equal(matchField("full name"), "name");
  assert.equal(matchField("your name"), "name");
});

check("autofill: surname ambiguous → null", () => {
  assert.equal(matchField("last name"), null);
  assert.equal(matchField("surname"), null);
});

check("autofill: valueFor respects input type first", () => {
  const profile = { ...EMPTY_PROFILE, email: "a@b.com", phone: "+8801" };
  assert.equal(valueFor({ descriptor: "whatever", type: "email" }, profile), "a@b.com");
  assert.equal(valueFor({ descriptor: "whatever", type: "tel" }, profile), "+8801");
});

check("autofill: empty profile value → null (never fill blanks)", () => {
  const c: FieldCandidate = { descriptor: "your email", type: "text" };
  assert.equal(valueFor(c, EMPTY_PROFILE), null);
});

check("autofill: profileSummary skips empties", () => {
  const s = profileSummary({ ...EMPTY_PROFILE, name: "Zonaed", email: "z@x.com" });
  assert.ok(s.includes("name: Zonaed"));
  assert.ok(s.includes("email: z@x.com"));
  assert.ok(!s.includes("phone"));
});

console.log(`\n${passed}/10 edit/autofill checks passed`);
if (passed !== 10 || process.exitCode === 1) process.exit(1);