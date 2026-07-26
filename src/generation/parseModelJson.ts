// Tolerant parsing of model JSON answers, kept out of server.ts so tests can import it
// without booting the HTTP listener.

/**
 * Parse a model's JSON answer, tolerating the two things models on the json_object fallback
 * path actually do wrong: wrapping the object in a ```json fence, and padding it with a
 * sentence of prose. Observed on gemini-3.6-flash-high, where both turned a perfectly good
 * creature into a failed sample.
 *
 * It only strips wrapping — anything still malformed inside (a truncated string, an
 * unescaped quote) throws as before, because guessing at broken art is worse than failing
 * the sample and letting the N-sample pipeline drop it.
 */
export function parseModelJson<T>(text: string, what: string): T {
  const trimmed = (text ?? "").trim();
  if (!trimmed) throw new Error(`The model returned an empty ${what} response.`);
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not parse the ${what} response.`);
}
