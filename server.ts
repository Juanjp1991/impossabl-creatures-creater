import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type GuidedAnimalBrief, type ReferenceMode } from "./src/generation/contracts";
import { validateAnimalDraft } from "./src/generation/validation";
import { mergeTargetedModification, type ModificationTarget } from "./src/generation/repair";
import { approvedStyleGuidePrompt } from "./src/generation/styleGuide";
import { normalizeAnimalDraftCoordinates, normalizeGeneratedSvgSyntax, snapAttachedPartsToAnchors } from "./src/generation/normalize";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HMR_PORT = Number(process.env.HMR_PORT) || 24678;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
// Optional (local dev): route AI through an OpenAI-compatible proxy such as
// CLIProxyAPI (e.g. AI_PROXY_URL="http://localhost:8317/v1") so a ChatGPT/Codex or
// Claude subscription can serve GEMINI_MODEL. When AI_PROXY_URL is set the app speaks
// the OpenAI Chat Completions protocol (which preserves JSON-schema structured
// output); otherwise it calls Google Gemini directly with GEMINI_API_KEY.
const AI_PROXY_URL = (process.env.AI_PROXY_URL || "").trim().replace(/\/+$/, "");
const AI_PROXY_KEY = (process.env.AI_PROXY_KEY || "").trim();
// Reasoning effort for proxied reasoning models (e.g. gpt-5.6-sol). Lower effort is
// faster and far less likely to hit upstream stream timeouts on big generations; the
// model is highly capable at low effort. Raise to "medium"/"high" for harder jobs.
const AI_PROXY_REASONING = (process.env.AI_PROXY_REASONING || "low").trim();
const PROMPT_VERSIONS = { planner: "p1-plan-3.0.0", generator: "p1-svg-3.0.0", reviewer: "p1-review-3.0.0", repair: "p1-repair-3.0.0" };
const MODEL_VERSIONS = { planner: GEMINI_MODEL, generator: GEMINI_MODEL, reviewer: GEMINI_MODEL, repair: GEMINI_MODEL };
const REPAIR_FIELD_BY_PART = { head: "headSvg", body: "bodySvg", frontLegs: "frontLegsSvg", backLegs: "backLegsSvg", tail: "tailSvg" } as const;

// Set up body parsers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Minimal client interface shared by the Google GenAI SDK and the OpenAI-compatible
// proxy adapter: both expose models.generateContent({model, contents, config}) and
// resolve to an object exposing a `text` string, so the rest of the server is agnostic.
type GenerateResult = { text: string };
interface AiClient {
  models: { generateContent(options: { model: string; contents: any; config?: any }): Promise<GenerateResult> };
}

// AI providers (§7 in-app model selector). Both the CLIProxyAPI path and the direct Google
// Gemini path can be live at once; each contributes its models to a small registry, and
// resolveModel() maps a per-request modelId to the right client + model. The default is
// today's behaviour: proxy when configured, else Gemini.
interface ModelEntry { id: string; label: string; provider: "gemini" | "proxy"; model: string; }
const parseModelList = (value: string | undefined) => (value || "").split(",").map((entry) => entry.trim()).filter(Boolean);

let geminiClient: AiClient | null = null;
let proxyClient: AiClient | null = null;
let keyValidationError = "";
const MODEL_REGISTRY: ModelEntry[] = [];

// Proxy path. AI_PROXY_MODELS lists the served model ids; for back-compat it falls back to
// GEMINI_MODEL, which in proxy mode is just the routed id (e.g. gpt-5.6-sol).
if (AI_PROXY_URL) {
  proxyClient = createOpenAiProxyClient(AI_PROXY_URL, AI_PROXY_KEY);
  const configured = parseModelList(process.env.AI_PROXY_MODELS);
  for (const model of configured.length ? configured : [GEMINI_MODEL]) MODEL_REGISTRY.push({ id: `proxy:${model}`, label: `${model} · proxy`, provider: "proxy", model });
  console.log(`AI proxy ${AI_PROXY_URL} serving: ${MODEL_REGISTRY.filter((entry) => entry.provider === "proxy").map((entry) => entry.model).join(", ")}`);
}

// Direct Gemini path, using GEMINI_API_KEY. GEMINI_MODELS lists the direct models; for
// back-compat it falls back to GEMINI_MODEL ONLY when not in proxy mode (in proxy mode
// GEMINI_MODEL is the proxy's routed id, which is not a valid direct-Gemini model).
{
  const rawApiKey = process.env.GEMINI_API_KEY;
  if (rawApiKey) {
    const apiKey = rawApiKey.trim().replace(/^["']|["']$/g, "");
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "YOUR_GEMINI_API_KEY" || apiKey === "undefined" || apiKey === "null") {
      keyValidationError = "The Gemini API key is configured with a placeholder value or is empty. Please configure a real API key in Settings > Secrets.";
    } else if (!apiKey.startsWith("AIzaSy") && !apiKey.startsWith("AQ.")) {
      keyValidationError = "The Gemini API key configured in Settings > Secrets does not appear to be a valid Google API key (valid keys start with 'AIzaSy' or 'AQ.'). Please ensure you have pasted the correct key.";
    } else {
      geminiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { "User-Agent": "aistudio-build" },
          timeout: 120000, // 2 minutes timeout to prevent HeadersTimeoutError on complex SVG generations
          // generateContentWithRetry owns the retry policy so requests stay predictably bounded.
          retryOptions: { attempts: 1 },
        },
      }) as unknown as AiClient;
    }
  } else if (!AI_PROXY_URL) {
    keyValidationError = "GEMINI_API_KEY environment variable is not defined. Please configure it in Settings > Secrets.";
  }
  if (geminiClient) {
    const configured = parseModelList(process.env.GEMINI_MODELS);
    for (const model of configured.length ? configured : AI_PROXY_URL ? [] : [GEMINI_MODEL]) MODEL_REGISTRY.push({ id: `gemini:${model}`, label: `${model} · Gemini`, provider: "gemini", model });
  }
}

const DEFAULT_MODEL_ID = (MODEL_REGISTRY.find((entry) => entry.provider === "proxy") ?? MODEL_REGISTRY[0])?.id ?? "";
if (!MODEL_REGISTRY.length) console.warn("No AI model configured: " + (keyValidationError || "set AI_PROXY_URL (+ AI_PROXY_MODELS) or GEMINI_API_KEY (+ GEMINI_MODELS)."));
const noModelError = () => keyValidationError || "No AI model is configured. Set AI_PROXY_URL (+ AI_PROXY_MODELS) or GEMINI_API_KEY (+ GEMINI_MODELS).";

// Resolve a per-request modelId to its client + model, falling back to the default. Returns
// null when nothing is configured (endpoints answer 503).
function resolveModel(modelId: unknown): { client: AiClient; model: string; entry: ModelEntry } | null {
  const entry = MODEL_REGISTRY.find((candidate) => candidate.id === modelId) ?? MODEL_REGISTRY.find((candidate) => candidate.id === DEFAULT_MODEL_ID);
  if (!entry) return null;
  const client = entry.provider === "proxy" ? proxyClient : geminiClient;
  return client ? { client, model: entry.model, entry } : null;
}

// True for proxied models whose upstream honours OpenAI response_format:json_schema —
// i.e. the OpenAI/Codex family (gpt-*, o1/o3-*, codex-*). Everything else served by the
// proxy (claude-*, kimi-*, …) ignores json_schema and needs the json_object + schema-in-
// prompt fallback below.
const proxyModelHonorsJsonSchema = (model: string) => /^(gpt-|o\d|codex-)/i.test(model) || /codex/i.test(model);

// --- OpenAI-compatible proxy adapter -----------------------------------------
// Translates the app's Gemini-shaped request ({model, contents, config}) into an
// OpenAI Chat Completions call and back, so a ChatGPT/Codex subscription served via
// CLIProxyAPI can drive the same generation pipeline. Only used when AI_PROXY_URL set.
function createOpenAiProxyClient(baseUrl: string, apiKey: string): AiClient {
  return {
    models: {
      async generateContent(options) {
        const { model, contents, config } = options;
        const messages: any[] = [];
        if (config?.systemInstruction) {
          messages.push({ role: "system", content: geminiToText(config.systemInstruction) });
        }
        messages.push({ role: "user", content: geminiContentsToOpenAi(contents) });

        const body: any = { model, messages };
        if (AI_PROXY_REASONING) body.reasoning_effort = AI_PROXY_REASONING;
        if (config?.responseMimeType === "application/json") {
          const schema = config?.responseSchema ? geminiSchemaToJsonSchema(config.responseSchema) : null;
          if (schema && !proxyModelHonorsJsonSchema(model)) {
            // CLIProxyAPI only translates response_format:json_schema for its OpenAI/Codex
            // upstream; Claude (and other non-GPT proxied models) ignore it and answer in
            // prose. Fall back to json_object mode and hand the model the schema as text —
            // the deterministic validator still discards any malformed sample, so the only
            // cost is an occasional dropped candidate in the N-sample pipeline.
            body.response_format = { type: "json_object" };
            // CLIProxyAPI does not hard-enforce json_object for Claude, so compliance rides
            // on the instruction being the LAST thing the model sees — a trailing user turn
            // overrides any conversational framing in the system/user prompt above it.
            messages.push({ role: "user", content: `CRITICAL OUTPUT FORMAT — overrides any formatting implied above: respond with ONLY one raw JSON object and nothing else. No prose, no explanation, no markdown code fences, no leading or trailing text. The object must conform exactly to this JSON Schema, populating every required property: ${JSON.stringify(schema)}` });
          } else {
            body.response_format = schema
              ? { type: "json_schema", json_schema: { name: "response", strict: false, schema } }
              : { type: "json_object" };
          }
        }

        // Reasoning models can be slow on large generations; default to 5 min unless
        // the caller pinned a shorter per-request timeout (e.g. repair).
        const timeout = config?.httpOptions?.timeout ?? 300000;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        let resp: Response;
        try {
          resp = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (err: any) {
          if (err?.name === "AbortError") throw new Error(`Proxy request timed out after ${timeout}ms (DEADLINE_EXCEEDED)`);
          throw err;
        } finally {
          clearTimeout(timer);
        }

        const raw = await resp.text();
        if (!resp.ok) throw new Error(`Proxy request failed (${resp.status}): ${raw.slice(0, 500)}`);
        let json: any;
        try {
          json = JSON.parse(raw);
        } catch {
          throw new Error(`Proxy returned non-JSON response: ${raw.slice(0, 300)}`);
        }
        const u = json?.usage;
        if (u) {
          const reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
          console.log(`[proxy usage] model=${model} prompt=${u.prompt_tokens ?? "?"} output=${u.completion_tokens ?? "?"} (reasoning=${reasoning}) total=${u.total_tokens ?? "?"}`);
        }
        const content = json?.choices?.[0]?.message?.content;
        return { text: typeof content === "string" ? content : content == null ? "" : JSON.stringify(content) };
      },
    },
  };
}

// Flatten a Gemini systemInstruction (string | {parts:[...]} | Part[]) to plain text.
function geminiToText(content: any): string {
  if (typeof content === "string") return content;
  const parts = Array.isArray(content) ? content : content?.parts;
  if (Array.isArray(parts)) return parts.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("\n");
  return "";
}

// Convert Gemini `contents` into an OpenAI user-message content value: a plain string
// when text-only, or a multimodal array mixing {type:"text"} and {type:"image_url"}.
function geminiContentsToOpenAi(contents: any): any {
  if (typeof contents === "string") return contents;
  let rawParts: any[] = [];
  if (Array.isArray(contents)) {
    for (const c of contents) rawParts.push(...(c?.parts ?? [c]));
  } else if (contents?.parts) {
    rawParts = contents.parts;
  }
  const out: any[] = [];
  for (const p of rawParts) {
    if (p == null) continue;
    if (typeof p === "string") { out.push({ type: "text", text: p }); continue; }
    if (p.text != null) { out.push({ type: "text", text: p.text }); continue; }
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      out.push({ type: "image_url", image_url: { url: `data:${mime};base64,${inline.data}` } });
    }
  }
  if (out.length > 0 && out.every((x) => x.type === "text")) return out.map((x) => x.text).join("\n");
  return out;
}

// Convert a Gemini response schema (Type.OBJECT etc.) into standard JSON Schema:
// lowercase the `type` enums and drop Gemini-only keys the proxy doesn't need.
function geminiSchemaToJsonSchema(node: any): any {
  if (Array.isArray(node)) return node.map(geminiSchemaToJsonSchema);
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "propertyOrdering" || k === "nullable" || k === "format" || k === "example") continue;
      if (k === "type" && typeof v === "string") { out.type = v.toLowerCase(); continue; }
      if (k === "properties" && v && typeof v === "object") {
        const props: any = {};
        for (const [pk, pv] of Object.entries(v as Record<string, any>)) props[pk] = geminiSchemaToJsonSchema(pv);
        out.properties = props;
        continue;
      }
      if (k === "items") { out.items = geminiSchemaToJsonSchema(v); continue; }
      out[k] = v && typeof v === "object" ? geminiSchemaToJsonSchema(v) : v;
    }
    return out;
  }
  return node;
}

// Robust wrapper helper to handle transient 503 errors and rate limits with exponential backoff retries
async function generateContentWithRetry(
  aiClient: AiClient,
  options: {
    model: string;
    contents: string | any;
    config: any;
  },
  maxRetries = 3,
  initialDelay = 2000
) {
  let attempt = 0;
  while (true) {
    try {
      return await aiClient.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      const errorMsg = typeof error === "string" ? error : (error?.message || JSON.stringify(error) || "");
      const isTimeout = /timeout|timed out|deadline|DEADLINE_EXCEEDED/i.test(errorMsg);
      const isTransient =
        errorMsg.includes("503") ||
        errorMsg.includes("504") ||
        errorMsg.includes("UNAVAILABLE") ||
        errorMsg.includes("high demand") ||
        errorMsg.includes("DEADLINE_EXCEEDED") ||
        errorMsg.includes("deadline") ||
        errorMsg.includes("429") ||
        errorMsg.includes("busy") ||
        errorMsg.includes("overloaded") ||
        // Proxy/upstream (CLIProxyAPI -> Codex) transient stream drops.
        errorMsg.includes("408") ||
        errorMsg.includes("stream disconnected") ||
        errorMsg.includes("stream closed") ||
        errorMsg.includes("before completion");

      // Retrying a full timeout makes the UI appear hung. Fast transient
      // failures can still receive a bounded retry.
      if (isTransient && !isTimeout && attempt <= maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        console.warn(`[Gemini SDK] Transient error detected (${errorMsg.substring(0, 150)}). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

function getFriendlyErrorMessage(error: any): string {
  const errorStr = typeof error === "string" ? error : (error?.message || JSON.stringify(error) || "");
  if (
    errorStr.includes("API key not valid") || 
    errorStr.includes("API_KEY_INVALID") || 
    (errorStr.includes("INVALID_ARGUMENT") && (errorStr.toLowerCase().includes("key") || errorStr.toLowerCase().includes("api")))
  ) {
    return "Your Gemini API key is invalid or has expired. Please configure a valid GEMINI_API_KEY inside the 'Settings > Secrets' menu (top-right of your screen in Google AI Studio). Double-check that you copied the key correctly and didn't include any extra quotes or trailing spaces.";
  }
  return errorStr;
}

function imagePartFromDataUrl(image: unknown) {
  if (typeof image !== "string" || !image.trim()) return null;
  const match = image.match(/^data:([^;]+);base64,(.+)$/);
  return { inlineData: { mimeType: match?.[1] || "image/png", data: match?.[2] || image } };
}

function requestedReferenceMode(value: unknown): ReferenceMode {
  return value === "inspire" ? "inspire" : "match";
}

function referenceDirective(hasReference: boolean, mode: ReferenceMode): string {
  if (!hasReference) return "No reference image is supplied; infer species-accurate anatomy from the brief.";
  if (mode === "inspire") return "The image is loose inspiration: retain its strongest species cues, palette and design language, but the brief may change pose and proportions.";
  return "The image is the structural authority. Match its side-view silhouette, pose, head/body ratio, limb folding, ground stance, visible digits, palette placement and presence or absence of an external tail. The brief controls finish and naming but must not replace image anatomy with a generic standing mammal. Ignore the image background, crop artifacts, logos, text and watermarks.";
}

function assertBrief(value: unknown): GuidedAnimalBrief {
  const brief = value as GuidedAnimalBrief;
  if (!brief || typeof brief !== "object" || typeof brief.animalName !== "string" || !brief.animalName.trim() || typeof brief.summary !== "string" || !brief.summary.trim()) {
    throw new Error("A complete guided animal brief with an editable summary is required.");
  }
  return brief;
}

const pointSchema = { type: Type.OBJECT, properties: { x: { type: Type.INTEGER }, y: { type: Type.INTEGER } }, required: ["x", "y"] };
const boundsSchema = { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER } }, required: ["x", "y", "width", "height"] };
const vectorSchema = { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } }, required: ["x", "y"] };
const scaleRangeSchema = { type: Type.OBJECT, properties: { min: { type: Type.NUMBER }, max: { type: Type.NUMBER } }, required: ["min", "max"] };
const connectionProfileSchema = {
  type: Type.OBJECT,
  properties: {
    part: { type: Type.STRING }, socketAnchor: pointSchema, attachmentAnchor: pointSchema,
    outwardNormal: vectorSchema, opposingNormal: vectorSchema, seamWidth: { type: Type.NUMBER }, minimumOverlap: { type: Type.NUMBER },
    neutralConnectionDepth: { type: Type.NUMBER }, allowedScale: scaleRangeSchema,
  },
  required: ["part", "socketAnchor", "attachmentAnchor", "outwardNormal", "opposingNormal", "seamWidth", "minimumOverlap", "neutralConnectionDepth", "allowedScale"],
};
const groundContactSchema = { type: Type.OBJECT, properties: { x: { type: Type.INTEGER }, y: { type: Type.INTEGER }, raised: { type: Type.BOOLEAN } }, required: ["x", "y"] };
const depthGroupSchema = { type: Type.OBJECT, properties: { farGroupId: { type: Type.STRING }, nearGroupId: { type: Type.STRING } }, required: ["farGroupId", "nearGroupId"] };
const layoutMetadataSchema = {
  type: Type.OBJECT,
  properties: {
    facing: { type: Type.STRING }, groundY: { type: Type.NUMBER }, connections: { type: Type.ARRAY, items: connectionProfileSchema },
    groundContacts: { type: Type.OBJECT, properties: { frontLegs: { type: Type.ARRAY, items: groundContactSchema }, backLegs: { type: Type.ARRAY, items: groundContactSchema } }, required: ["frontLegs", "backLegs"] },
    depthGroups: { type: Type.OBJECT, properties: { frontLegs: depthGroupSchema, backLegs: depthGroupSchema }, required: ["frontLegs", "backLegs"] },
  },
  required: ["facing", "groundY", "connections", "groundContacts", "depthGroups"],
};
const bodyConnectionsSchema = {
  type: Type.OBJECT,
  properties: {
    neck: { ...pointSchema, description: "BODY-LOCAL point only: x 40-120, y 50-130 inside the 300x220 body." },
    tail: { ...pointSchema, description: "BODY-LOCAL point only: x 200-280, y 80-160 inside the 300x220 body." },
    frontLegs: { ...pointSchema, description: "BODY-LOCAL point only: x 70-140, y 130-190 inside the 300x220 body." },
    backLegs: { ...pointSchema, description: "BODY-LOCAL point only: x 180-250, y 130-190 inside the 300x220 body." },
  },
  required: ["neck", "tail", "frontLegs", "backLegs"],
};
const animalDraftSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    color: { type: Type.STRING, description: "The creature's PRIMARY palette colour as a concrete 6-digit hex (e.g. \"#8B5A2B\") — a real, species-appropriate colour, NOT the word \"primary\". The ramp tokens primary/primary-light/primary-dark used inside the SVGs are computed from this hex at render time." },
    accentColor: { type: Type.STRING, description: "The creature's ACCENT palette colour as a concrete 6-digit hex (e.g. \"#F5E6C8\") — a real, species-appropriate marking colour, NOT the word \"accent\". The ramp tokens accent/accent-dark used inside the SVGs are computed from this hex at render time." },
    description: { type: Type.STRING },
    bodyConnections: bodyConnectionsSchema,
    headSvg: { type: Type.STRING, description: "Inner SVG using HEAD-LOCAL coordinates only, all geometry inside 0..160 x 0..160, joined at local (120,110). Never use assembled-canvas coordinates." },
    bodySvg: { type: Type.STRING, description: "Inner SVG using BODY-LOCAL coordinates only, all geometry inside 0..300 x 0..220. Never use assembled-canvas coordinates." },
    frontLegsSvg: { type: Type.STRING, description: "Inner SVG using FORELIMB-LOCAL coordinates only, all geometry inside 0..260 x 0..180, joined at local (75,15)." },
    backLegsSvg: { type: Type.STRING, description: "Inner SVG using HINDLIMB-LOCAL coordinates only, all geometry inside 0..260 x 0..180, joined at local (195,15)." },
    tailSvg: { type: Type.STRING, description: "Inner SVG using TAIL-LOCAL coordinates only, all geometry inside 0..160 x 0..160, joined at local (15,15)." },
    layoutMetadata: layoutMetadataSchema,
  },
  required: ["name", "color", "accentColor", "description", "bodyConnections", "headSvg", "bodySvg", "frontLegsSvg", "backLegsSvg", "tailSvg", "layoutMetadata"],
};

const guidedBriefSchema = {
  type: Type.OBJECT,
  properties: {
    animalName: { type: Type.STRING },
    preset: { type: Type.STRING, enum: ["friendly-cartoon", "natural-semi-realistic", "detailed-game-asset", "strong-combat-animal", "young-and-cute"] },
    sexOrVariant: { type: Type.STRING, enum: ["neutral", "female", "male", "cow", "bull"] },
    age: { type: Type.STRING, enum: ["young", "adult", "mature"] },
    bodyBuild: { type: Type.STRING, enum: ["soft and balanced", "species-accurate", "athletic", "powerful and muscular", "small and round"] },
    style: { type: Type.STRING, enum: ["natural", "cartoon", "semi-realistic", "fantasy", "semi-realistic game art"] },
    detailLevel: { type: Type.STRING, enum: ["low", "medium", "high"] },
    pose: { type: Type.STRING, enum: ["relaxed side view", "natural standing side view", "clear readable side view", "grounded combat-ready side view", "playful standing side view"] },
    expression: { type: Type.STRING, enum: ["friendly", "calm", "alert", "determined", "curious and cheerful"] },
    mainColour: { type: Type.STRING }, markings: { type: Type.STRING }, definingAnatomy: { type: Type.STRING },
    advancedInstructions: { type: Type.STRING }, summary: { type: Type.STRING },
    mode: { type: Type.STRING, enum: ["draft", "high-quality"] },
  },
  required: ["animalName", "preset", "sexOrVariant", "age", "bodyBuild", "style", "detailLevel", "pose", "expression", "mainColour", "markings", "definingAnatomy", "advancedInstructions", "summary", "mode"],
};

// The models the UI may choose from, and today's default. A plain list — no plugin framework.
app.get("/api/models", (_req, res) => {
  res.json({ models: MODEL_REGISTRY.map(({ id, label, provider }) => ({ id, label, provider })), defaultModelId: DEFAULT_MODEL_ID });
});

app.post("/api/populate-brief", async (req, res) => {
  try {
    const resolved = resolveModel(req.body?.modelId);
    if (!resolved) return res.status(503).json({ error: noModelError() });
    const current = (req.body?.currentBrief || {}) as Partial<GuidedAnimalBrief>;
    const reference = imagePartFromDataUrl(req.body?.image);
    if (!current.animalName?.trim() && !reference) return res.status(400).json({ error: "An animal name or reference image is required to auto-fill details." });
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    const referenceRules = referenceDirective(Boolean(reference), referenceMode);
    const prompt = `Populate every editable guided SVG-generation field for: ${current.animalName || "the animal in image 1"}. Reference mode: ${referenceMode}. Existing form values are generic placeholders, not user decisions; replace them with the best species/reference-specific choices. Preserve only the non-empty animal name and quality mode. Existing form: ${JSON.stringify(current)}.`;
    const response = await generateContentWithRetry(resolved.client, {
      model: resolved.model,
      contents: reference ? { role: "user", parts: [reference, { text: prompt }] } : prompt,
      config: {
        systemInstruction: `You prepare practical prompt fields for a structured five-part animal SVG generator. ${referenceRules} Choose only the supplied enum values. Treat incoming form values as replaceable defaults; do not echo generic values such as friendly cartoon, soft and balanced, medium detail or relaxed pose unless they genuinely are the best match. Prefer detailed-game-asset, high detail, species-accurate anatomy and the reference's actual pose for a normal close-match request. Describe the real palette, markings, silhouette, pose, head features, shoulder/chest, hip, limb bends, paws/toes and tail. In advancedInstructions, demand continuous shoulder-to-paw and hip-to-paw silhouettes, near/far depth separation, grounded feet, and broad upper-limb collars that extend 10-18px into the torso so seams are hidden. Request layered meaningful vector shapes rather than simple ellipses or disconnected fragments. Keep the result specific and editable, not conversational. The expanded summary must combine every important choice. Model ${resolved.model}.`,
        responseMimeType: "application/json",
        responseSchema: guidedBriefSchema,
      },
    });
    if (!response.text) throw new Error("The model returned an empty guided brief.");
    const generated = JSON.parse(response.text) as GuidedAnimalBrief;
    const brief: GuidedAnimalBrief = {
      ...generated,
      animalName: current.animalName?.trim() || generated.animalName.trim(),
      mode: current.mode === "draft" ? "draft" : "high-quality",
    };
    assertBrief(brief);
    return res.json({ brief, model: resolved.model });
  } catch (error: any) {
    console.error("Error auto-filling guided animal brief:", error);
    return res.status(500).json({ error: "Failed to auto-fill prompt details. Details: " + getFriendlyErrorMessage(error) });
  }
});

// Priority 0 controlled generation: one merged plan+draw call, deterministic coordinate
// normalization, snap-to-anchor, then deterministic validation. No separate planner and
// no blueprint (§5.1 dec.4). Prompt variation across samples rides in on the brief.
function quadrupedPlan(brief: GuidedAnimalBrief): AnatomyStylePlan {
  return {
    speciesFeatures: [brief.definingAnatomy].filter((value) => Boolean(value && value.trim())),
    anatomyTemplate: "quadruped-five-part",
    requiredParts: [...PART_TYPES],
    proportionsAndSilhouette: brief.bodyBuild,
    pose: brief.pose,
    orientation: "left-facing",
    paletteAndMarkings: [brief.mainColour, brief.markings].filter((value) => Boolean(value && value.trim())).join("; "),
    layerPlan: [
      { part: "tail", layer: "back", purpose: "rear silhouette behind the body" },
      { part: "backLegs", layer: "back", purpose: "semantic far and near hind limbs" },
      { part: "body", layer: "middle", purpose: "central torso" },
      { part: "frontLegs", layer: "front", purpose: "semantic far and near forelimbs" },
      { part: "head", layer: "front", purpose: "recognizable face and head silhouette" },
    ],
    attachmentStrategy: [],
    requiredNamedGroups: {
      head: ["head-root"], body: ["body-root"],
      frontLegs: ["frontLegs-root", "frontLegs-far", "frontLegs-near"],
      backLegs: ["backLegs-root", "backLegs-far", "backLegs-near"],
      tail: ["tail-root"],
    },
    suggestedJoints: [],
  };
}

app.post("/api/generate-animal", async (req, res) => {
  try {
    const resolved = resolveModel(req.body?.modelId);
    if (!resolved) return res.status(503).json({ error: noModelError() });
    const brief = assertBrief(req.body?.brief);
    const originalRequest = typeof req.body?.prompt === "string" && req.body.prompt.trim() ? req.body.prompt.trim() : brief.animalName;
    const reference = imagePartFromDataUrl(req.body?.image);
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    const referenceRules = referenceDirective(Boolean(reference), referenceMode);
    const generationResponse = await generateContentWithRetry(resolved.client, {
      model: resolved.model,
      contents: reference
        ? { role: "user", parts: [reference, { text: `Draw a faithful five-part vector decomposition of image 1. Reference mode: ${referenceMode}. Guided brief: ${JSON.stringify(brief)}` }] }
        : `Design and draw this animal from the guided brief: ${JSON.stringify(brief)}`,
      config: {
        systemInstruction: `You design and draw one polished, compact, left-facing five-part SVG animal in a single structured response. ${referenceRules} The five parts are head, body, frontLegs, backLegs and tail, each authored in ITS OWN fixed local coordinate space, never one shared canvas. Restart coordinates near zero for every field: headSvg and tailSvg inside 0..160 x 0..160; bodySvg inside 0..300 x 0..220; both leg SVGs inside 0..260 x 0..180. Do not add an assembled-canvas offset to any path or anchor. Plan recognizable, species-specific proportions and silhouette before drawing; use purposeful organic contour, facial, marking and shading groups rather than generic rectangles, simple ellipses or disconnected decoration. Preserve a crouched, seated, swimming or folded-limb pose where the species calls for it; do not straighten limbs merely to fill a local view. Give the body opaque geometry around all four socket anchors. Attachment regions are approximate because exact placement is corrected in code, so you need not hit them pixel-perfectly: head meets the body near local (120,110); frontLegs near (75,15); backLegs near (195,15); tail near (15,15). bodyConnections are BODY-LOCAL: neck x40-120 y50-130, tail x200-280 y80-160, frontLegs x70-140 y130-190, backLegs x180-250 y130-190, with the neck left of the tail. Around each limb attachment create a broad 24-40px upper-limb collar spanning local y=0..35 so 10-18px of the limb visibly enters the torso. Every foreleg silhouette is continuous from shoulder to paw and every hind-leg silhouette continuous from hip through hock to paw, never floating fragments. Every seam needs both opaque silhouettes inside the joint zone and at least 40 overlapping opaque pixels. Grounded paws stay within 10px of a common groundY. Layer order is tail, far hind, far fore, body, near hind, near fore, head. Put every visible limb shape under a semantic depth group and emit exact far/near group IDs frontLegs-far, frontLegs-near, backLegs-far and backLegs-near. Emit local layoutMetadata with facing "left", groundY, per-leg ground contacts, depth groups and one connection profile per attached part whose attachmentAnchor is the local point that meets the body. COLOUR: use ONLY these shared ramp tokens as fill and stroke values inside the SVGs, never raw hex or rgb — primary with primary-light and primary-dark for the main silhouette and its shading, accent with accent-dark for markings, the fixed token outline for dark outlines and highlight for light glints. Separately, the top-level color and accentColor fields MUST be two concrete 6-digit hex values (e.g. "#8B5A2B" and "#F5E6C8") — the real, species-appropriate colours this creature is painted in — NOT the words "primary"/"accent"; every ramp token above is computed from those two hexes at render time, so a wrong or missing hex makes the whole creature render grey. STROKE WEIGHT: use stroke-width 3 for silhouette outlines and 1 to 1.5 for fine internal detail; never below 1. DETAIL DENSITY: keep each part compact and in-band — roughly head 8-28, body 8-26, each leg set 5-14 and tail 3-10 visible shapes — and let each part fill about 65-95% of its own local view height. Every group ID appears once and all IDs are globally unique; include each root group head-root, body-root, frontLegs-root, backLegs-root and tail-root. Use compact valid inner SVG only: no <svg> wrapper and no gradients, filters, masks or clipPaths. ${approvedStyleGuidePrompt()} Prompt version ${PROMPT_VERSIONS.generator}.`,
        responseMimeType: "application/json", responseSchema: animalDraftSchema,
        maxOutputTokens: 16384,
      },
    });
    if (!generationResponse.text) throw new Error("The model returned an empty SVG response.");
    const rawAnimal = JSON.parse(generationResponse.text) as AnimalDraft;
    const plan = quadrupedPlan(brief);
    const syntaxNormalization = normalizeGeneratedSvgSyntax(rawAnimal);
    const normalization = normalizeAnimalDraftCoordinates(syntaxNormalization.animal, plan);
    const animal = snapAttachedPartsToAnchors(normalization.animal);
    const validation = validateAnimalDraft(animal);
    const models = { ...MODEL_VERSIONS, planner: resolved.model, generator: resolved.model };
    return res.json({ animal, plan, validation, originalRequest, brief, models, promptVersions: PROMPT_VERSIONS, modelId: resolved.entry.id, deterministicNormalization: { coordinates: normalization.normalizedParts, syntaxAndPalette: syntaxNormalization.changedParts } });
  } catch (error: any) {
    console.error("Error generating custom animal via AI:", error);
    const status = /guided animal brief|required/i.test(error?.message || "") ? 400 : 500;
    return res.status(status).json({ error: "Failed to generate creature SVG. Details: " + getFriendlyErrorMessage(error) });
  }
});

// AI-driven custom animal modifier endpoint
app.post("/api/modify-animal", async (req, res) => {
  try {
    const { prompt, targetPart, currentAnimal, image } = req.body;
    const modificationTarget: ModificationTarget | undefined = targetPart === "all" ? "all" : PART_TYPES.includes(targetPart) ? targetPart : undefined;
    if (!modificationTarget) return res.status(400).json({ error: "Modification target must be all, head, body, frontLegs, backLegs or tail." });
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    if ((!prompt || typeof prompt !== "string" || !prompt.trim()) && !image) {
      return res.status(400).json({ error: "A valid prompt or an inspiring image is required." });
    }
    if (!currentAnimal || typeof currentAnimal !== "object") {
      return res.status(400).json({ error: "Current animal data is required for iterative modification." });
    }

    const resolved = resolveModel(req.body?.modelId);
    if (!resolved) return res.status(503).json({ error: noModelError() });

    let imagePart: any = null;
    if (image && typeof image === "string" && image.trim()) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        imagePart = {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        };
      } else {
        imagePart = {
          inlineData: {
            mimeType: "image/png",
            data: image,
          },
        };
      }
    }

    const systemInstruction = `You are an expert vector designer and master illustrator who designs clean, adorable, and highly-detailed SVG illustrations for animals and mythological creatures. 

Your task is to modify an EXISTING custom animal/creature template based on the user's prompt or provided visual reference. ${referenceDirective(Boolean(imagePart), referenceMode)}
You can modify the whole creature, or focus your modifications on a specific body part if the user requested it.

The targeted body part to modify is: "${modificationTarget}".
If targetPart is specific, return ONLY that part's SVG field. Every non-target SVG, name, colour, description and body connection is immutable and must not be returned or adjusted, even subtly.
If targetPart is "all", you can modify any or all parts, colors, description, name, or connections.

CRITICAL SVG COORDINATE SPACE AND CONNECTION AGREEMENTS (KEEP CONSISTENT WITH CURRENT CREATURE):
1. HEAD: viewBox is "0 0 160 160".
   - Neck connection point: local (120, 110). Design the base to meet exactly at (120, 110).
2. BODY: viewBox is "0 0 300 220".
   - Connection pivot coordinates: neck, tail, frontLegs, backLegs. Keep them consistent or adjust if the body structure changes.
3. FRONT LEGS: viewBox is "0 0 260 180".
   - Front legs join body: local (75, 15). Design top of shoulder to meet at (75, 15).
4. BACK LEGS: viewBox is "0 0 260 180".
   - Back legs join body: local (195, 15). Design top of hip to meet at (195, 15).
5. TAIL: viewBox is "0 0 160 160".
   - Tail joins body: local (15, 15). Design base to meet exactly at (15, 15).

STYLING & COLOR CONVENTIONS:
- Keep the current colors ("color" and "accentColor") unless the user explicitly requests a color change. If you do change them, the "color" and "accentColor" fields MUST be concrete 6-digit hex values (e.g. "#8B5A2B"), never the words "primary"/"accent".
- Use the literal ramp tokens "primary" and "accent" (and their derived steps primary-light, primary-dark, accent-dark, outline, highlight) inside fills/strokes of the SVGs; those tokens are computed from the two hex fields above at render time.
- Ensure the output SVGs are fully closed, beautiful, valid, and organic.

ULTRA-FAST PERFORMANCE REQUIREMENT:
To guarantee extremely fast execution and avoid network timeouts (like 504 Deadline Exceeded), you MUST ONLY return the properties or SVG markups that are actually being modified or updated. For any fields that remain unchanged, you MUST omit them or return null. The server will merge your changes automatically. Do not write unchanged SVG strings.

Here is the current creature data:
Name: ${currentAnimal.name}
Description: ${currentAnimal.description}
Primary Color: ${currentAnimal.color}
Accent Color: ${currentAnimal.accentColor}
Body Connections: ${JSON.stringify(currentAnimal.bodyConnections)}
Head SVG: ${currentAnimal.headSvg}
Body SVG: ${currentAnimal.bodySvg}
Front Legs SVG: ${currentAnimal.frontLegsSvg}
Back Legs SVG: ${currentAnimal.backLegsSvg}
Tail SVG: ${currentAnimal.tailSvg}

Apply the requested modification: "${prompt || "Modify creature using the provided image"}" to the current creature. Be creative, but respect the existing creature's aesthetics unless the user wants a complete redesign of that part.`;

    const promptText = prompt && prompt.trim() ? prompt.trim() : `Modify the ${modificationTarget} part of the creature inspired by the provided image.`;
    let contents: any;
    if (imagePart) {
      contents = {
        role: "user",
        parts: [
          imagePart,
          { text: `Modify the current creature. Reference mode: "${referenceMode}". Instruction: "${promptText}". The only permitted target is: "${modificationTarget}".` }
        ]
      };
    } else {
      contents = `Modify the current creature. Prompt instruction: "${promptText}". The only permitted target is: "${modificationTarget}".`;
    }

    const targetField = modificationTarget === "all" ? undefined : REPAIR_FIELD_BY_PART[modificationTarget];
    const allModificationProperties = {
      name: { type: Type.STRING },
      color: animalDraftSchema.properties.color, accentColor: animalDraftSchema.properties.accentColor,
      description: { type: Type.STRING },
      bodyConnections: animalDraftSchema.properties.bodyConnections,
      headSvg: { type: Type.STRING }, bodySvg: { type: Type.STRING }, frontLegsSvg: { type: Type.STRING }, backLegsSvg: { type: Type.STRING }, tailSvg: { type: Type.STRING },
    };
    const responseProperties = targetField
      ? { [targetField]: { type: Type.STRING, description: `Required changed inner SVG markup for ${modificationTarget}; preserve its existing required group IDs and local attachment contract.` }, ...(modificationTarget === "body" ? { bodyConnections: animalDraftSchema.properties.bodyConnections } : {}) }
      : allModificationProperties;

    const response = await generateContentWithRetry(resolved.client, {
      model: resolved.model,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: { type: Type.OBJECT, properties: responseProperties, required: targetField ? [targetField] : [] },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini model.");
    }

    const animalData = JSON.parse(text) as Partial<AnimalDraft>;
    const { animal: mergedAnimal, changedParts } = mergeTargetedModification(currentAnimal as AnimalDraft, animalData, modificationTarget);
    if (targetField && !changedParts.includes(modificationTarget as typeof PART_TYPES[number])) {
      return res.status(422).json({ error: `Gemini did not return a changed ${targetField}. The original animal was preserved; try a more specific instruction.` });
    }
    return res.json({ ...mergedAnimal, modifiedParts: changedParts });
  } catch (error: any) {
    console.error("Error modifying custom animal via AI:", error);
    return res.status(500).json({
      error: "Failed to modify creature SVG. Details: " + getFriendlyErrorMessage(error),
    });
  }
});

// Serve frontend assets
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: HMR_PORT } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
