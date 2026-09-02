// ============================================================================
// LLM client for the extension (E2 reply suggestions, E3 ghostwriter, E6).
//
// Independent implementation of the same OpenAI-compatible chat-completions
// contract the webapp providers use (no code sharing — this repo is a separate
// codebase). Keys are read from the options page at call time and NEVER stored
// in content scripts. OpenRouter-style base URLs work out of the box; the
// options page passes any base URL + key + model.
// ============================================================================

export interface LlmConfig {
  baseUrl: string; // e.g. https://openrouter.ai/api/v1
  apiKey: string;
  model: string;
}

/** One-shot completion (non-streaming — replies are short). */
export async function complete(
  cfg: LlmConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens = 180,
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `LLM HTTP ${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM returned an empty reply");
  return content;
}