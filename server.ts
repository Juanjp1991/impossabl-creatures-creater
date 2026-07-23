import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type GuidedAnimalBrief, type ReferenceMode, type VisualReviewReport } from "./src/generation/contracts";
import { validateAnimalDraft } from "./src/generation/validation";
import { mergeTargetedModification, mergeTargetedRepair, type ModificationTarget } from "./src/generation/repair";
import { approvedStyleGuidePrompt } from "./src/generation/styleGuide";
import { normalizeAnimalDraftCoordinates, normalizeAnatomyPlanContract, normalizeGeneratedSvgSyntax } from "./src/generation/normalize";
import { QUALITY_POLICIES, REVIEW_CATEGORIES, normalizeActionableReview, reviewIssuesForPart } from "./src/generation/quality";

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
const REPAIR_TIMEOUT_MS = 75_000;

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

// Initialize the AI client. Two mutually exclusive paths:
//  - AI_PROXY_URL set  -> OpenAI-compatible proxy (CLIProxyAPI), preserves JSON schema.
//  - otherwise         -> Google Gemini directly, using GEMINI_API_KEY (unchanged).
let isKeyValid = false;
let keyValidationError = "";
let ai: AiClient | null = null;

if (AI_PROXY_URL) {
  ai = createOpenAiProxyClient(AI_PROXY_URL, AI_PROXY_KEY);
  isKeyValid = true;
  console.log(`AI routed through OpenAI-compatible proxy ${AI_PROXY_URL} using model "${GEMINI_MODEL}".`);
} else {
  let rawApiKey = process.env.GEMINI_API_KEY;
  let apiKey = "";

  if (rawApiKey) {
    apiKey = rawApiKey.trim().replace(/^["']|["']$/g, "");
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "YOUR_GEMINI_API_KEY" || apiKey === "undefined" || apiKey === "null") {
      keyValidationError = "The Gemini API key is configured with a placeholder value or is empty. Please configure a real API key in Settings > Secrets.";
    } else if (!apiKey.startsWith("AIzaSy") && !apiKey.startsWith("AQ.")) {
      keyValidationError = "The Gemini API key configured in Settings > Secrets does not appear to be a valid Google API key (valid keys start with 'AIzaSy' or 'AQ.'). Please ensure you have pasted the correct key.";
    } else {
      isKeyValid = true;
    }
  } else {
    keyValidationError = "GEMINI_API_KEY environment variable is not defined. Please configure it in Settings > Secrets.";
  }

  if (isKeyValid && apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
        timeout: 120000, // 2 minutes timeout to prevent HeadersTimeoutError on complex SVG generations
        // The SDK otherwise retries up to five times internally. Retry policy is
        // handled by generateContentWithRetry so requests remain predictably bounded.
        retryOptions: { attempts: 1 },
      },
    }) as unknown as AiClient;
  } else {
    console.warn("Gemini AI client initialization skipped: " + keyValidationError);
  }
}

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
          body.response_format = config?.responseSchema
            ? { type: "json_schema", json_schema: { name: "response", strict: false, schema: geminiSchemaToJsonSchema(config.responseSchema) } }
            : { type: "json_object" };
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
    name: { type: Type.STRING }, color: { type: Type.STRING }, accentColor: { type: Type.STRING }, description: { type: Type.STRING },
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

const planSchema = {
  type: Type.OBJECT,
  properties: {
    speciesFeatures: { type: Type.ARRAY, items: { type: Type.STRING } },
    anatomyTemplate: { type: Type.STRING },
    requiredParts: { type: Type.ARRAY, items: { type: Type.STRING } },
    proportionsAndSilhouette: { type: Type.STRING }, pose: { type: Type.STRING }, orientation: { type: Type.STRING }, paletteAndMarkings: { type: Type.STRING },
    layerPlan: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { part: { type: Type.STRING }, layer: { type: Type.STRING }, purpose: { type: Type.STRING } }, required: ["part", "layer", "purpose"] } },
    attachmentStrategy: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { part: { type: Type.STRING }, anchor: { type: Type.STRING }, strategy: { type: Type.STRING } }, required: ["part", "anchor", "strategy"] } },
    requiredNamedGroups: { type: Type.OBJECT, properties: Object.fromEntries(PART_TYPES.map((part) => [part, { type: Type.ARRAY, items: { type: Type.STRING } }])), required: PART_TYPES },
    suggestedJoints: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { part: { type: Type.STRING }, name: { type: Type.STRING }, x: { type: Type.INTEGER }, y: { type: Type.INTEGER } }, required: ["part", "name", "x", "y"] } },
    referenceAnalysis: {
      type: Type.OBJECT,
      properties: {
        fidelityTarget: { type: Type.STRING, enum: ["close-match", "inspiration", "none"] }, silhouette: { type: Type.STRING }, pose: { type: Type.STRING }, proportions: { type: Type.STRING },
        speciesCues: { type: Type.ARRAY, items: { type: Type.STRING } }, palette: { type: Type.STRING }, paletteSwatches: { type: Type.ARRAY, items: { type: Type.STRING } }, externalTail: { type: Type.STRING, enum: ["visible", "absent", "unclear"] },
        backgroundElementsToIgnore: { type: Type.ARRAY, items: { type: Type.STRING } },
        referenceFeatures: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
          id: { type: Type.STRING }, part: { type: Type.STRING }, kind: { type: Type.STRING }, description: { type: Type.STRING },
          normalizedBounds: boundsSchema, importance: { type: Type.STRING }, requiredGroupId: { type: Type.STRING },
        }, required: ["id", "part", "kind", "description", "normalizedBounds", "importance", "requiredGroupId"] } },
      },
      required: ["fidelityTarget", "silhouette", "pose", "proportions", "speciesCues", "palette", "paletteSwatches", "externalTail", "backgroundElementsToIgnore", "referenceFeatures"],
    },
    blueprint: {
      type: Type.OBJECT,
      properties: {
        occupiedBounds: { type: Type.OBJECT, properties: Object.fromEntries(PART_TYPES.map((part) => [part, boundsSchema])), required: PART_TYPES },
        assembledBounds: { type: Type.OBJECT, properties: Object.fromEntries([...PART_TYPES, "animal"].map((part) => [part, boundsSchema])), required: [...PART_TYPES, "animal"] },
        groundY: { type: Type.NUMBER }, connections: { type: Type.ARRAY, items: connectionProfileSchema },
        limbPlan: { type: Type.OBJECT, properties: Object.fromEntries(["frontLegs", "backLegs"].map((part) => [part, { type: Type.OBJECT, properties: {
          expectedVisibleCount: { type: Type.INTEGER }, groundedCount: { type: Type.INTEGER }, raisedCount: { type: Type.INTEGER }, toeDirection: { type: Type.STRING },
        }, required: ["expectedVisibleCount", "groundedCount", "raisedCount", "toeDirection"] }])), required: ["frontLegs", "backLegs"] },
        landmarks: { type: Type.OBJECT, properties: { noseTip: pointSchema, eye: pointSchema, neckBase: pointSchema, shoulder: pointSchema, hip: pointSchema, pawBottoms: { type: Type.ARRAY, items: groundContactSchema }, heels: { type: Type.ARRAY, items: pointSchema }, toeTips: { type: Type.ARRAY, items: pointSchema } }, required: ["noseTip", "eye", "neckBase", "shoulder", "hip", "pawBottoms", "heels", "toeTips"] },
      },
      required: ["occupiedBounds", "assembledBounds", "groundY", "connections", "limbPlan", "landmarks"],
    },
  },
  required: ["speciesFeatures", "anatomyTemplate", "requiredParts", "proportionsAndSilhouette", "pose", "orientation", "paletteAndMarkings", "layerPlan", "attachmentStrategy", "requiredNamedGroups", "suggestedJoints", "referenceAnalysis", "blueprint"],
};

const reviewSchema = {
  type: Type.OBJECT,
  properties: {
    scores: { type: Type.OBJECT, properties: Object.fromEntries(REVIEW_CATEGORIES.map((category) => [category, { type: Type.INTEGER }])), required: REVIEW_CATEGORIES },
    issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, category: { type: Type.STRING }, part: { type: Type.STRING }, affectedParts: { type: Type.ARRAY, items: { type: Type.STRING } }, severity: { type: Type.STRING }, description: { type: Type.STRING }, suggestedCorrection: { type: Type.STRING }, regenerationRequired: { type: Type.BOOLEAN } }, required: ["id", "category", "part", "affectedParts", "severity", "description", "suggestedCorrection", "regenerationRequired"] } },
    summary: { type: Type.STRING }, approved: { type: Type.BOOLEAN },
    comparison: { type: Type.OBJECT, properties: {
      verdict: { type: Type.STRING }, summary: { type: Type.STRING }, resolvedIssueIds: { type: Type.ARRAY, items: { type: Type.STRING } },
      persistentIssueIds: { type: Type.ARRAY, items: { type: Type.STRING } }, introducedIssueIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    }, required: ["verdict", "summary", "resolvedIssueIds", "persistentIssueIds", "introducedIssueIds"] },
  }, required: ["scores", "issues", "summary", "approved"],
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

app.post("/api/populate-brief", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const current = (req.body?.currentBrief || {}) as Partial<GuidedAnimalBrief>;
    const reference = imagePartFromDataUrl(req.body?.image);
    if (!current.animalName?.trim() && !reference) return res.status(400).json({ error: "An animal name or reference image is required to auto-fill details." });
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    const referenceRules = referenceDirective(Boolean(reference), referenceMode);
    const prompt = `Populate every editable guided SVG-generation field for: ${current.animalName || "the animal in image 1"}. Reference mode: ${referenceMode}. Existing form values are generic placeholders, not user decisions; replace them with the best species/reference-specific choices. Preserve only the non-empty animal name and quality mode. Existing form: ${JSON.stringify(current)}.`;
    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: reference ? { role: "user", parts: [reference, { text: prompt }] } : prompt,
      config: {
        systemInstruction: `You prepare practical prompt fields for a structured five-part animal SVG generator. ${referenceRules} Choose only the supplied enum values. Treat incoming form values as replaceable defaults; do not echo generic values such as friendly cartoon, soft and balanced, medium detail or relaxed pose unless they genuinely are the best match. Prefer detailed-game-asset, high detail, species-accurate anatomy and the reference's actual pose for a normal close-match request. Describe the real palette, markings, silhouette, pose, head features, shoulder/chest, hip, limb bends, paws/toes and tail. In advancedInstructions, demand continuous shoulder-to-paw and hip-to-paw silhouettes, near/far depth separation, grounded feet, and broad upper-limb collars that extend 10-18px into the torso so seams are hidden. Request layered meaningful vector shapes rather than simple ellipses or disconnected fragments. Keep the result specific and editable, not conversational. The expanded summary must combine every important choice. Model ${GEMINI_MODEL}.`,
        responseMimeType: "application/json",
        responseSchema: guidedBriefSchema,
      },
    });
    if (!response.text) throw new Error("Gemini returned an empty guided brief.");
    const generated = JSON.parse(response.text) as GuidedAnimalBrief;
    const brief: GuidedAnimalBrief = {
      ...generated,
      animalName: current.animalName?.trim() || generated.animalName.trim(),
      mode: current.mode === "draft" ? "draft" : "high-quality",
    };
    assertBrief(brief);
    return res.json({ brief, model: GEMINI_MODEL });
  } catch (error: any) {
    console.error("Error auto-filling guided animal brief:", error);
    return res.status(500).json({ error: "Failed to auto-fill prompt details. Details: " + getFriendlyErrorMessage(error) });
  }
});

// Priority 0 controlled generation: structured plan, SVG generation, deterministic validation.
app.post("/api/generate-animal", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const brief = assertBrief(req.body?.brief);
    const qualityPolicy = QUALITY_POLICIES[brief.mode];
    const originalRequest = typeof req.body?.prompt === "string" && req.body.prompt.trim() ? req.body.prompt.trim() : brief.animalName;
    const reference = imagePartFromDataUrl(req.body?.image);
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    const referenceRules = referenceDirective(Boolean(reference), referenceMode);
    const planResponse = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: reference ? { role: "user", parts: [reference, { text: `Analyze image 1, then plan the animal. Reference mode: ${referenceMode}. Guided brief: ${JSON.stringify(brief)}` }] } : `Plan this animal from the guided brief: ${JSON.stringify(brief)}`,
      config: {
        systemInstruction: `You are the anatomy and visual-style planner for a five-part SVG animal builder. Return a precise plan only. ${referenceRules} Fill referenceAnalysis with concrete observations; externalTail must be visible, absent or unclear. Emit 2-4 six-digit paletteSwatches ordered by visual importance and 5-12 located referenceFeatures for the defining contours, markings, face, limb bends and tail. Reference feature bounds are normalized to the source image from 0 to 1, and every critical or major feature needs a globally unique requiredGroupId. For amphibians and other crouched animals, preserve the low body and folded fore/hind limb geometry instead of converting it into straight mammal legs. The schema remains head, body, frontLegs, backLegs and tail, orientation left-facing. For a naturally tailless animal, plan tail as a compact non-protruding rump seam-cap behind the body, never as an external appendage. CRITICAL COORDINATE RULE: this is NOT one shared illustration canvas. Every occupiedBounds value is LOCAL to that part's own view: head/tail 160x160, body 300x220, each limb set 260x180. assembledBounds are on the canonical 600x500 assembled preview. Socket anchors are BODY-LOCAL; attachment anchors and paw contacts are PART-LOCAL. Never output values such as x=330 or x=630 for body anchors. Body sockets must stay in these ranges: neck x40-120 y50-130; tail x200-280 y80-160; frontLegs x70-140 y130-190; backLegs x180-250 y130-190. Plan broad shoulder and hip seams: limb silhouettes must extend above their local anchors into the torso, with seam widths around 24-40px and useful connection depth around 10-18px. Include each root group and frontLegs-far/frontLegs-near/backLegs-far/backLegs-near. limbPlan must state how many visible legs are expected, including grounded and explicitly raised limbs. Layer order is tail, far hind, far fore, body, near hind, near fore, head. The numeric blueprint is mandatory. Enforce nose.x < eye.x < neckBase.x, shoulder.x < hip.x, front socket before hind socket, toeTip.x < heel.x and opposing normals. Use positive profiles and scale range 0.7-1.3. Plan recognizable species-specific proportions. ${approvedStyleGuidePrompt()} Prompt version ${PROMPT_VERSIONS.planner}.`,
        responseMimeType: "application/json", responseSchema: planSchema,
      },
    });
    if (!planResponse.text) throw new Error("Gemini returned an empty anatomy plan.");
    let plan = normalizeAnatomyPlanContract(JSON.parse(planResponse.text) as AnatomyStylePlan);
    const generationResponse = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: reference ? { role: "user", parts: [reference, { text: `Generate a faithful five-part vector decomposition of image 1. Reference mode: ${referenceMode}. Brief: ${JSON.stringify(brief)} Locked plan: ${JSON.stringify(plan)}` }] } : `Generate the animal from this locked brief and plan. Brief: ${JSON.stringify(brief)} Plan: ${JSON.stringify(plan)}`,
      config: {
        systemInstruction: `Create one polished compact left-facing animal in one structured response; do not use body-first generation. ${referenceRules} Follow referenceAnalysis and the locked blueprint literally, including assembledBounds, paletteSwatches, limbPlan and every critical/major referenceFeature. Give each reference feature real visible geometry under its requiredGroupId. High quality means purposeful organic contour, facial, marking and shading groups, not generic rectangles, simple ellipses or disconnected decoration. Preserve a crouched, seated, swimming or folded-limb pose; do not straighten limbs merely to fill their local view. If externalTail is absent, tailSvg must be a small opaque seam-cap clustered around local (15,15), hidden behind the opaque rump in assembly, with no protruding tail shape. The body must contain opaque geometry around all four socket anchors. ABSOLUTE RULE: each SVG is an isolated LOCAL drawing, never a crop from one shared/global canvas. Restart coordinates near zero for every field. headSvg and tailSvg must stay within x0-160/y0-160; bodySvg within x0-300/y0-220; both leg SVGs within x0-260/y0-180. bodyConnections are BODY-LOCAL and must use neck x40-120 y50-130, tail x200-280 y80-160, frontLegs x70-140 y130-190 and backLegs x180-250 y130-190. The fixed local attachment points are head (120,110), frontLegs (75,15), backLegs (195,15), tail (15,15). Every foreleg silhouette must be continuous from shoulder to paw and every hind-leg silhouette continuous from hip through hock to paw—never floating fragments. Around each limb attachment, create a broad 24-40px upper-limb collar spanning local y=0..35 so 10-18px of the limb visibly enters the torso. Far collars sit behind the body; near collars overlap the body edge cleanly without internal gaps. Do not add an assembled-canvas offset to any SVG path or anchor. Follow the locked blueprint. Every seam needs both opaque silhouettes inside an 18px joint zone and at least 80 overlapping opaque pixels. Grounded paws stay within 10px of common groundY. Emit local layoutMetadata and exact far/near group IDs. Put every visible limb shape under a depth group. Use compact valid inner SVG, primary for main silhouettes and accent for markings. Every group ID appears once and all IDs are globally unique. Before returning, numerically check every path coordinate and body anchor against its field's local bounds. ${approvedStyleGuidePrompt()} Prompt version ${PROMPT_VERSIONS.generator}.`,
        responseMimeType: "application/json", responseSchema: animalDraftSchema,
        maxOutputTokens: qualityPolicy.generationOutputTokens,
      },
    });
    if (!generationResponse.text) throw new Error("Gemini returned an empty SVG response.");
    const rawAnimal = JSON.parse(generationResponse.text) as AnimalDraft;
    const syntaxNormalization = normalizeGeneratedSvgSyntax(rawAnimal);
    const normalization = normalizeAnimalDraftCoordinates(syntaxNormalization.animal, plan);
    const animal = normalization.animal;
    if (reference && referenceMode === "match") {
      const swatches = plan.referenceAnalysis?.paletteSwatches?.filter((colour) => /^#[0-9a-f]{6}$/i.test(colour)) ?? [];
      if (swatches[0]) animal.color = swatches[0];
      if (swatches[1]) animal.accentColor = swatches[1];
    }
    plan = normalization.plan;
    const validation = validateAnimalDraft(animal, plan);
    return res.json({ animal, plan, validation, originalRequest, brief, models: MODEL_VERSIONS, promptVersions: PROMPT_VERSIONS, deterministicNormalization: { coordinates: normalization.normalizedParts, syntaxAndPalette: syntaxNormalization.changedParts } });
  } catch (error: any) {
    console.error("Error generating custom animal via AI:", error);
    const status = /guided animal brief|required/i.test(error?.message || "") ? 400 : 500;
    return res.status(status).json({ error: "Failed to generate creature SVG. Details: " + getFriendlyErrorMessage(error) });
  }
});

// Separate visual-review call. Exact coordinate checks remain in deterministic validation.
app.post("/api/review-animal", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const { animal, plan, originalRequest, brief } = req.body || {};
    const validation = validateAnimalDraft(animal, plan);
    const qualityPolicy = QUALITY_POLICIES[(brief?.mode === "draft" ? "draft" : "high-quality")];
    const composite = imagePartFromDataUrl(req.body?.reviewCompositePreview);
    const baseline = imagePartFromDataUrl(req.body?.baselineCompositePreview);
    const reference = imagePartFromDataUrl(req.body?.image);
    const referenceMode = requestedReferenceMode(req.body?.referenceMode);
    if (!composite) return res.status(400).json({ error: "The clean/silhouette/diagnostic/mobile review composite is required." });
    const reviewImages = [reference, baseline, composite].filter(Boolean);
    const imageDescription = reference && baseline
      ? "Image 1 is the original reference, image 2 is the saved best composite, and image 3 is the candidate composite."
      : reference
        ? "Image 1 is the original reference and image 2 is the candidate composite."
        : baseline
          ? "Image 1 is the saved best composite and image 2 is the candidate composite."
          : "Image 1 is the candidate composite.";
    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: { role: "user", parts: [...reviewImages, { text: `${imageDescription} Reference mode: ${referenceMode}. Review clean colour, silhouette, corrected diagnostic seams and mobile thumbnail. Technical validation is ${validation.valid ? "valid" : `provisional with ${validation.issues.filter((issue) => issue.severity === "error").length} errors`}; visual findings are still required when the composite is readable. Original request: ${originalRequest}. Guided brief: ${JSON.stringify(brief)}. Anatomy/style plan: ${JSON.stringify(plan)}. Previous best review and stable issue IDs: ${JSON.stringify(req.body?.previousReview || null)}.` }] },
      config: {
        systemInstruction: `You are an independent visual QA reviewer. Do not redesign the animal and do not repeat exact coordinate validation. When an original reference is supplied in close-match mode, referenceFidelity measures pose, silhouette, head/body ratio, limb folding, species cues, palette placement and tail presence; shapeAccuracy measures the actual contours and placement; featurePlacementAndDetail measures the planned ears, muzzle, markings, joints, paws and tail details. A generic standing pose, missing far limb, blocky substitute species or invented appendage is a major or critical failure. Ignore backgrounds, text, logos and watermarks in the reference. In inspiration mode, score only retained design cues rather than pixel similarity. Score every supplied category from 1 to 10. Every issue needs a stable id, a primary part and affectedParts containing every repairable head, body, frontLegs, backLegs or tail. An animal-wide failure must still identify concrete repairable affectedParts. Use minor, major, or critical severity and give a measurable correction. The regenerationRequired flag chooses local versus coherent rescue; it never suppresses a major issue. If a saved best is supplied, compare it directly with the candidate, reuse persistent issue IDs, and fill comparison with resolved, persistent and introduced issue IDs. Inspect near/far layering and mobile readability. High quality requires protected fidelity/detail scores of 8 and other scores of 7; draft requires 7. Prompt version ${PROMPT_VERSIONS.reviewer}.`,
        responseMimeType: "application/json", responseSchema: reviewSchema,
      },
    });
    if (!response.text) throw new Error("Gemini returned an empty visual review.");
    const parsedReview = JSON.parse(response.text) as VisualReviewReport;
    const review = normalizeActionableReview({ ...parsedReview, provisional: !validation.valid }, qualityPolicy)!;
    return res.json({ review, model: MODEL_VERSIONS.reviewer, promptVersion: PROMPT_VERSIONS.reviewer });
  } catch (error: any) {
    console.error("Error reviewing custom animal via AI:", error);
    return res.status(500).json({ error: "Failed to visually review creature. Details: " + getFriendlyErrorMessage(error) });
  }
});

// Targeted repair returns a fully merged animal while changing only requested failing parts.
app.post("/api/repair-animal", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const current = req.body?.currentAnimal as AnimalDraft;
    const plan = req.body?.plan as AnatomyStylePlan;
    const requested = Array.isArray(req.body?.failingParts) ? req.body.failingParts.filter((part: unknown) => PART_TYPES.includes(part as any)) : [];
    const round = Number(req.body?.round);
    const brief = assertBrief(req.body?.brief);
    const qualityPolicy = QUALITY_POLICIES[brief.mode];
    const strategy = ["technical", "part", "cluster"].includes(req.body?.strategy) ? req.body.strategy : (requested.length > 1 ? "cluster" : "part");
    if (!current || !plan || !requested.length) return res.status(400).json({ error: "Current animal, plan and at least one failing part are required." });
    if (!Number.isInteger(round) || round < 1 || round > qualityPolicy.maxAttempts) return res.status(400).json({ error: `Automatic repair attempt must be between 1 and ${qualityPolicy.maxAttempts}.` });
    // Repair each part independently. A five-part repair previously asked for
    // almost another complete animal in one response, which commonly exhausted
    // the model deadline and left the browser waiting through hidden retries.
    const repairResults = await Promise.allSettled(requested.map(async (part) => {
      const field = REPAIR_FIELD_BY_PART[part];
      const properties: Record<string, unknown> = { [field]: { type: Type.STRING } };
      if (part === "body") properties.bodyConnections = animalDraftSchema.properties.bodyConnections;
      properties.layoutMetadata = layoutMetadataSchema;
      const technicalIssues = (req.body.validation?.issues || []).filter((issue: any) => issue?.part === part || issue?.part === "animal");
      const visualIssues = reviewIssuesForPart(req.body.review, part);
      const currentPart = { [field]: current[field], ...(part === "body" ? { bodyConnections: current.bodyConnections } : {}) };
      const reference = imagePartFromDataUrl(req.body?.image);
      const clean = imagePartFromDataUrl(req.body?.cleanPreview);
      const diagnostic = imagePartFromDataUrl(req.body?.diagnosticPreview);
      const isolated = imagePartFromDataUrl(req.body?.isolatedPreviews?.[part]);
      const jointCrop = imagePartFromDataUrl(req.body?.jointCrops?.[part]);
      const visualParts = [reference, clean, diagnostic, isolated, jointCrop].filter(Boolean);
      const visualLabels = [reference && "original reference", clean && "assembled clean preview", diagnostic && "diagnostic preview", isolated && `isolated ${part} preview`, jointCrop && "joint crop"].filter(Boolean).join(", in that order; ");
      const connectionProfile = plan.blueprint?.connections?.find((entry) => entry.part === part);
      const adjacentAcceptedSvg = part === "body"
        ? Object.fromEntries(PART_TYPES.filter((candidate) => candidate !== "body" && !requested.includes(candidate)).map((candidate) => [REPAIR_FIELD_BY_PART[candidate], current[REPAIR_FIELD_BY_PART[candidate]]]))
        : { bodySvg: current.bodySvg };
      const maskMetrics = {
        part: req.body.geometry?.parts?.[part],
        body: req.body.geometry?.parts?.body,
        seam: req.body.geometry?.seams?.find((entry: any) => entry.part === part),
        intersections: req.body.geometry?.unintendedIntersections?.filter((entry: any) => entry.first === part || entry.second === part),
        groundY: req.body.geometry?.groundY,
      };
      const response = await generateContentWithRetry(ai!, {
        model: GEMINI_MODEL,
        contents: { role: "user", parts: [...visualParts, { text: `Repair ONLY the ${part} part as the ${strategy} phase of quality attempt ${round}. Supplied images are: ${visualLabels || "none"}. Reference mode: ${requestedReferenceMode(req.body?.referenceMode)}. Brief: ${JSON.stringify(brief)}. Plan: ${JSON.stringify(plan)}. Current part: ${JSON.stringify(currentPart)}. Adjacent accepted SVG that must stay byte-identical: ${JSON.stringify(adjacentAcceptedSvg)}. Connection profile: ${JSON.stringify(connectionProfile)}. Deterministic mask metrics: ${JSON.stringify(maskMetrics)}. Technical errors: ${JSON.stringify(technicalIssues)}. Visual issues, including issues where this is a secondary affected part: ${JSON.stringify(visualIssues)}.` }] },
        config: {
          systemInstruction: `You repair one isolated SVG animal part while preserving every accepted part. Apply every supplied visual issue that names this part in affectedParts, not only issues where it is primary. When an original reference is supplied, preserve its silhouette, pose, limb folding, palette, feature groups and tail presence while fixing the reported defect. For externalTail=absent, repair tail as a compact opaque seam-cap around local (15,15) that is covered by the body in assembly—never invent a protruding appendage. For a limb repair, redraw each affected leg as one continuous shoulder-to-paw or hip-to-hock-to-paw silhouette. Create a broad upper collar around the fixed anchor spanning local y=0..35, entering the torso by 10-18px with at least 80 opaque seam pixels; do not return disconnected decorative fragments as limbs. Return ${field}${part === "body" ? " and BODY-LOCAL bodyConnections if needed" : ""}; return layoutMetadata only if this part's local contacts, depth IDs or connection profile must change. Never use assembled/global coordinates. The repaired field must restart in its own viewBox: head/tail 160x160, body 300x220, limbs 260x180. Keep its fixed local attachment point. Use the adjacent accepted SVG, profile, mask metrics, assembled preview and joint crop to close the seam without moving accepted artwork. Preserve required root, depth and reference-feature groups; use primary and accent plus purposeful detail shapes. Attempt ${round} of ${qualityPolicy.maxAttempts}. Prompt version ${PROMPT_VERSIONS.repair}.`,
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties, required: [field] },
          maxOutputTokens: qualityPolicy.repairOutputTokens,
          httpOptions: { timeout: REPAIR_TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      }, 1, 1000);
      if (!response.text) throw new Error(`Gemini returned an empty ${part} repair.`);
      return JSON.parse(response.text) as Partial<AnimalDraft>;
    }));
    const failures: string[] = [];
    let merged = current;
    const changedParts: typeof PART_TYPES[number][] = [];
    repairResults.forEach((result, index) => {
      const part = requested[index] as typeof PART_TYPES[number];
      if (result.status === "fulfilled") {
        const applied = mergeTargetedRepair(merged, result.value, [part]);
        merged = applied.animal;
        changedParts.push(...applied.changedParts);
      } else failures.push(`${part}: ${getFriendlyErrorMessage(result.reason)}`);
    });
    if (failures.length === requested.length) throw new Error(`All targeted repairs failed. ${failures.join(" | ")}`);
    if (failures.length) console.warn(`Targeted repair round ${round} completed partially: ${failures.join(" | ")}`);
    const syntaxNormalization = normalizeGeneratedSvgSyntax(merged);
    const normalization = normalizeAnimalDraftCoordinates(syntaxNormalization.animal, plan);
    const validation = validateAnimalDraft(normalization.animal, normalization.plan);
    return res.json({ animal: normalization.animal, plan: normalization.plan, validation, changedParts, requestedParts: requested, failedParts: requested.filter((part) => !changedParts.includes(part)), deterministicNormalization: { coordinates: normalization.normalizedParts, syntaxAndPalette: syntaxNormalization.changedParts }, round, strategy, model: MODEL_VERSIONS.repair, promptVersion: PROMPT_VERSIONS.repair });
  } catch (error: any) {
    console.error("Error repairing custom animal via AI:", error);
    return res.status(500).json({ error: "Failed to repair creature parts. Details: " + getFriendlyErrorMessage(error) });
  }
});

// One coherent rescue is available to High quality mode when the first complete
// animal is globally unlike the locked plan/reference. The caller still gates the
// candidate against the saved best and rolls it back if it does not improve.
app.post("/api/regenerate-animal", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const brief = assertBrief(req.body?.brief);
    const policy = QUALITY_POLICIES[brief.mode];
    if (!policy.allowFullRescue) return res.status(400).json({ error: "Full-animal rescue is only available in High quality mode." });
    const current = req.body?.currentAnimal as AnimalDraft;
    const plan = req.body?.plan as AnatomyStylePlan;
    if (!current || !plan) return res.status(400).json({ error: "Current animal and locked plan are required for rescue." });
    const reference = imagePartFromDataUrl(req.body?.image);
    const clean = imagePartFromDataUrl(req.body?.cleanPreview);
    const diagnostic = imagePartFromDataUrl(req.body?.diagnosticPreview);
    const images = [reference, clean, diagnostic].filter(Boolean);
    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: { role: "user", parts: [...images, { text: `Regenerate one coherent five-part candidate under the SAME locked plan. Reference mode: ${requestedReferenceMode(req.body?.referenceMode)}. Brief: ${JSON.stringify(brief)}. Locked plan: ${JSON.stringify(plan)}. Saved best animal: ${JSON.stringify(current)}. Technical findings: ${JSON.stringify(req.body?.validation?.issues || [])}. Visual findings: ${JSON.stringify(req.body?.review?.issues || [])}. Correct the global silhouette and all linked parts together; do not merely recolour the failed animal.` }] },
      config: {
        systemInstruction: `This is a single full-animal rescue, not body-first generation and not a new design. Return all five local SVG parts, body-local anchors and layout metadata in one structured response. The original reference and locked plan remain authoritative. Fix wrong-species silhouette, head/body ratio, missing limbs, limb placement, palette, tail and critical feature groups together. Preserve local coordinate contracts, exact near/far group IDs, broad seam collars, grounded paws and every critical/major requiredGroupId. Produce purposeful organic contours and reference-specific details rather than blocky generic primitives. Prompt version ${PROMPT_VERSIONS.repair}.`,
        responseMimeType: "application/json",
        responseSchema: animalDraftSchema,
        maxOutputTokens: policy.generationOutputTokens,
      },
    });
    if (!response.text) throw new Error("Gemini returned an empty full-animal rescue.");
    const syntaxNormalization = normalizeGeneratedSvgSyntax(JSON.parse(response.text) as AnimalDraft);
    const normalization = normalizeAnimalDraftCoordinates(syntaxNormalization.animal, plan);
    const animal = normalization.animal;
    if (reference && requestedReferenceMode(req.body?.referenceMode) === "match") {
      const swatches = plan.referenceAnalysis?.paletteSwatches?.filter((colour) => /^#[0-9a-f]{6}$/i.test(colour)) ?? [];
      if (swatches[0]) animal.color = swatches[0];
      if (swatches[1]) animal.accentColor = swatches[1];
    }
    const validation = validateAnimalDraft(animal, normalization.plan);
    return res.json({ animal, plan: normalization.plan, validation, changedParts: PART_TYPES, failedParts: [], strategy: "full-rescue", model: MODEL_VERSIONS.repair, promptVersion: PROMPT_VERSIONS.repair });
  } catch (error: any) {
    console.error("Error regenerating full custom animal:", error);
    return res.status(500).json({ error: "Failed to rescue complete creature. Details: " + getFriendlyErrorMessage(error) });
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

    if (!ai) {
      return res.status(503).json({
        error: keyValidationError || "Gemini API key is missing. Please configure GEMINI_API_KEY in Settings > Secrets.",
      });
    }

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
- Keep the current colors ("color" and "accentColor") unless the user explicitly requests a color change.
- Use the literal values "primary" and "accent" inside fills/strokes of the SVGs for the dynamic colors.
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
      name: { type: Type.STRING }, color: { type: Type.STRING }, accentColor: { type: Type.STRING }, description: { type: Type.STRING },
      bodyConnections: animalDraftSchema.properties.bodyConnections,
      headSvg: { type: Type.STRING }, bodySvg: { type: Type.STRING }, frontLegsSvg: { type: Type.STRING }, backLegsSvg: { type: Type.STRING }, tailSvg: { type: Type.STRING },
    };
    const responseProperties = targetField
      ? { [targetField]: { type: Type.STRING, description: `Required changed inner SVG markup for ${modificationTarget}; preserve its existing required group IDs and local attachment contract.` }, ...(modificationTarget === "body" ? { bodyConnections: animalDraftSchema.properties.bodyConnections } : {}) }
      : allModificationProperties;

    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
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
