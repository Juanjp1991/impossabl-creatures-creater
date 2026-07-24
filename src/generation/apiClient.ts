// Shared browser->server JSON transport for the generation pipeline. Kept tiny and
// dependency-free on purpose: the app talks to a handful of `/api/*` endpoints and
// the only cross-cutting concerns are a per-path timeout and readable error text.

export const REQUEST_TIMEOUTS: Record<string, number> = {
  "/api/populate-brief": 90_000,
  "/api/generate-animal": 270_000,
  "/api/modify-animal": 135_000,
};

export interface ModelOption { id: string; label: string; provider: "gemini" | "proxy"; }
export interface ModelsResponse { models: ModelOption[]; defaultModelId: string; }

/** The models the server offers for selection, plus today's default. Never throws hard —
 *  a failure returns an empty list so the UI simply falls back to the server default. */
export async function fetchModels(): Promise<ModelsResponse> {
  try {
    const response = await fetch("/api/models");
    if (!response.ok) return { models: [], defaultModelId: "" };
    return (await response.json()) as ModelsResponse;
  } catch {
    return { models: [], defaultModelId: "" };
  }
}

export async function postJson(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUTS[path] ?? 135_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(text.includes("<html") ? `Server error (${response.status}). Please try again.` : "Server returned invalid JSON."); }
    if (!response.ok) throw new Error(data.error || `Server returned error status ${response.status}`);
    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`The AI request exceeded ${Math.round(timeoutMs / 1000)} seconds and was stopped. Try again, or reduce the sample count.`);
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
