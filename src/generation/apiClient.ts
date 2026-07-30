// Shared browser->server JSON transport for the generation pipeline. Kept tiny and
// dependency-free on purpose: the app talks to a handful of `/api/*` endpoints and
// the only cross-cutting concerns are a per-path timeout and readable error text.

// Abort caps, not targets: slow subscription gateways (Cline Pass / Kimi K3) can take
// several minutes on a full five-part generation, so these sit above the server's own
// per-provider timeouts (5 min proxy/Gemini, 10 min Cline by default).
export const REQUEST_TIMEOUTS: Record<string, number> = {
  "/api/populate-brief": 150_000,
  "/api/generate-animal": 640_000,
  "/api/modify-animal": 135_000,
  // Image models render in ~10-60s; keep headroom for a slow flash-image run.
  "/api/generate-image": 180_000,
};

export interface ModelOption {
  id: string;
  label: string;
  /** "proxy" = CLIProxyAPI, "cline" = Cline Pass gateway, "gemini" = direct Google. */
  provider: "gemini" | "proxy" | "cline";
  /** False for models that reject image content, e.g. GLM 5.x. Absent on older servers. */
  vision?: boolean;
}
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
