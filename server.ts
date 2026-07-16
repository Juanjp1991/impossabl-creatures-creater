import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { PART_TYPES, type AnimalDraft, type AnatomyStylePlan, type GuidedAnimalBrief, type VisualReviewReport } from "./src/generation/contracts";
import { validateAnimalDraft } from "./src/generation/validation";
import { mergeTargetedRepair } from "./src/generation/repair";
import { approvedStyleGuidePrompt } from "./src/generation/styleGuide";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HMR_PORT = Number(process.env.HMR_PORT) || 24678;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const PROMPT_VERSIONS = { planner: "p0-plan-1.0.0", generator: "p0-svg-1.0.0", reviewer: "p0-review-1.0.0", repair: "p0-repair-1.0.0" };
const MODEL_VERSIONS = { planner: GEMINI_MODEL, generator: GEMINI_MODEL, reviewer: GEMINI_MODEL, repair: GEMINI_MODEL };

// Set up body parsers
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Initialize the Gemini AI SDK
let rawApiKey = process.env.GEMINI_API_KEY;
let apiKey = "";
let isKeyValid = false;
let keyValidationError = "";

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

let ai: GoogleGenAI | null = null;

if (isKeyValid && apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
      timeout: 120000, // 2 minutes timeout to prevent HeadersTimeoutError on complex SVG generations
    },
  });
} else {
  console.warn("Gemini AI client initialization skipped: " + keyValidationError);
}

// Robust wrapper helper to handle transient 503 errors and rate limits with exponential backoff retries
async function generateContentWithRetry(
  aiClient: GoogleGenAI,
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
      const isTransient =
        errorMsg.includes("503") ||
        errorMsg.includes("504") ||
        errorMsg.includes("UNAVAILABLE") ||
        errorMsg.includes("high demand") ||
        errorMsg.includes("DEADLINE_EXCEEDED") ||
        errorMsg.includes("deadline") ||
        errorMsg.includes("429") ||
        errorMsg.includes("busy") ||
        errorMsg.includes("overloaded");

      if (isTransient && attempt <= maxRetries) {
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

function assertBrief(value: unknown): GuidedAnimalBrief {
  const brief = value as GuidedAnimalBrief;
  if (!brief || typeof brief !== "object" || typeof brief.animalName !== "string" || !brief.animalName.trim() || typeof brief.summary !== "string" || !brief.summary.trim()) {
    throw new Error("A complete guided animal brief with an editable summary is required.");
  }
  return brief;
}

const pointSchema = { type: Type.OBJECT, properties: { x: { type: Type.INTEGER }, y: { type: Type.INTEGER } }, required: ["x", "y"] };
const animalDraftSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING }, color: { type: Type.STRING }, accentColor: { type: Type.STRING }, description: { type: Type.STRING },
    bodyConnections: { type: Type.OBJECT, properties: { neck: pointSchema, tail: pointSchema, frontLegs: pointSchema, backLegs: pointSchema }, required: ["neck", "tail", "frontLegs", "backLegs"] },
    headSvg: { type: Type.STRING }, bodySvg: { type: Type.STRING }, frontLegsSvg: { type: Type.STRING }, backLegsSvg: { type: Type.STRING }, tailSvg: { type: Type.STRING },
  },
  required: ["name", "color", "accentColor", "description", "bodyConnections", "headSvg", "bodySvg", "frontLegsSvg", "backLegsSvg", "tailSvg"],
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
  },
  required: ["speciesFeatures", "anatomyTemplate", "requiredParts", "proportionsAndSilhouette", "pose", "orientation", "paletteAndMarkings", "layerPlan", "attachmentStrategy", "requiredNamedGroups", "suggestedJoints"],
};

const reviewCategories = ["speciesRecognizability", "anatomicalPlausibility", "overallSilhouette", "proportionConsistency", "jointContinuity", "limbLayering", "stylePaletteConsistency", "groundAlignment", "clippingOverlaps", "mobileReadability"];
const reviewSchema = {
  type: Type.OBJECT,
  properties: {
    scores: { type: Type.OBJECT, properties: Object.fromEntries(reviewCategories.map((category) => [category, { type: Type.INTEGER }])), required: reviewCategories },
    issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { category: { type: Type.STRING }, part: { type: Type.STRING }, severity: { type: Type.STRING }, description: { type: Type.STRING }, suggestedCorrection: { type: Type.STRING }, regenerationRequired: { type: Type.BOOLEAN } }, required: ["category", "part", "severity", "description", "suggestedCorrection", "regenerationRequired"] } },
    summary: { type: Type.STRING }, approved: { type: Type.BOOLEAN },
  }, required: ["scores", "issues", "summary", "approved"],
};

// Priority 0 controlled generation: structured plan, SVG generation, deterministic validation.
app.post("/api/generate-animal", async (req, res) => {
  try {
    if (!ai) return res.status(503).json({ error: keyValidationError });
    const brief = assertBrief(req.body?.brief);
    const originalRequest = typeof req.body?.prompt === "string" && req.body.prompt.trim() ? req.body.prompt.trim() : brief.animalName;
    const reference = imagePartFromDataUrl(req.body?.image);
    const planResponse = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: reference ? { parts: [reference, { text: `Plan this animal from the guided brief and reference image: ${JSON.stringify(brief)}` }] } : `Plan this animal from the guided brief: ${JSON.stringify(brief)}`,
      config: {
        systemInstruction: `You are the anatomy and visual-style planner for a five-part SVG animal builder. Return a precise plan only. The existing schema is fixed to head, body, frontLegs, backLegs and tail. anatomyTemplate MUST be "quadruped-five-part", requiredParts MUST list those five exact values, and orientation MUST be "left-facing". Each part needs stable named groups; always include exactly its root id: head-root, body-root, frontLegs-root, backLegs-root or tail-root, plus useful feature groups. Layer order is tail/backLegs behind body, body middle, frontLegs/head front. Plan recognizable species features, silhouette, near/far limb treatment, palette, markings, attachment geometry and suggested pivots. ${approvedStyleGuidePrompt()} Prompt version ${PROMPT_VERSIONS.planner}.`,
        responseMimeType: "application/json", responseSchema: planSchema, temperature: brief.mode === "draft" ? 0.15 : 0.25,
      },
    });
    if (!planResponse.text) throw new Error("Gemini returned an empty anatomy plan.");
    const plan = JSON.parse(planResponse.text) as AnatomyStylePlan;
    const generationResponse = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: reference ? { parts: [reference, { text: `Generate the animal from this locked brief and plan. Brief: ${JSON.stringify(brief)} Plan: ${JSON.stringify(plan)}` }] } : `Generate the animal from this locked brief and plan. Brief: ${JSON.stringify(brief)} Plan: ${JSON.stringify(plan)}`,
      config: {
        systemInstruction: `Create a polished but compact left-facing animal using the existing five-part JSON schema. Follow the supplied anatomy/style plan exactly. Coordinate contract: head 160x160 with neck geometry touching (120,110); body 300x220 with neck x 40-120 y 50-130, tail x 200-280 y 80-160, frontLegs x 70-140 y 130-190, backLegs x 180-250 y 130-190; frontLegs 260x180 touching (75,15) and feet near y=180; backLegs 260x180 touching (195,15) and feet near y=180; tail 160x160 touching (15,15). SVG fields are inner XML only. Use only g,path,circle,rect,ellipse,polygon,polyline,line,defs,linearGradient,radialGradient,stop,filter,feDropShadow,feGaussianBlur,mask,clipPath. Use literal primary/accent placeholders for palette areas. Every named group in the plan must appear once with the exact id, including each part root. All IDs must be globally unique. Keep coordinates inside view bounds and geometry within 32px of every attachment anchor. For leg SVGs, represent far and near limbs in separately named groups. ${approvedStyleGuidePrompt()} Prompt version ${PROMPT_VERSIONS.generator}.`,
        responseMimeType: "application/json", responseSchema: animalDraftSchema, temperature: brief.mode === "draft" ? 0.15 : 0.25,
      },
    });
    if (!generationResponse.text) throw new Error("Gemini returned an empty SVG response.");
    const animal = JSON.parse(generationResponse.text) as AnimalDraft;
    const validation = validateAnimalDraft(animal, plan);
    return res.json({ animal, plan, validation, originalRequest, brief, models: MODEL_VERSIONS, promptVersions: PROMPT_VERSIONS });
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
    if (!validation.valid) return res.status(422).json({ error: "Technical validation must pass before visual review.", validation });
    const clean = imagePartFromDataUrl(req.body?.cleanPreview);
    const diagnostic = imagePartFromDataUrl(req.body?.diagnosticPreview);
    if (!clean || !diagnostic) return res.status(400).json({ error: "Clean and diagnostic PNG previews are required." });
    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: { parts: [clean, diagnostic, { text: `Review image 1 as the clean assembled animal and image 2 as the diagnostic preview. Original request: ${originalRequest}. Guided brief: ${JSON.stringify(brief)}. Anatomy/style plan: ${JSON.stringify(plan)}.` }] },
      config: {
        systemInstruction: `You are an independent visual QA reviewer. Do not redesign the animal and do not perform exact coordinate validation. Score each category from 1 to 10: species recognizability, anatomical plausibility, overall silhouette, proportion consistency, joint continuity/gaps, near/far limb layering, style/palette consistency, ground alignment, clipping/unintended overlaps and readability at mobile-game size. Every issue must name one of head, body, frontLegs, backLegs, tail, or animal; use minor, major, or critical severity; give a specific correction; and say if part regeneration is required. Approve only when no major/critical issues remain and every score is at least 7. Prompt version ${PROMPT_VERSIONS.reviewer}.`,
        responseMimeType: "application/json", responseSchema: reviewSchema, temperature: 0.1,
      },
    });
    if (!response.text) throw new Error("Gemini returned an empty visual review.");
    const review = JSON.parse(response.text) as VisualReviewReport;
    review.approved = review.issues.every((entry) => entry.severity === "minor") && Object.values(review.scores).every((score) => Number(score) >= 7);
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
    if (!current || !plan || !requested.length) return res.status(400).json({ error: "Current animal, plan and at least one failing part are required." });
    if (!Number.isInteger(round) || round < 1 || round > 2) return res.status(400).json({ error: "Automatic repair round must be 1 or 2." });
    const clean = imagePartFromDataUrl(req.body?.cleanPreview);
    const diagnostic = imagePartFromDataUrl(req.body?.diagnosticPreview);
    const visualParts = [clean, diagnostic].filter(Boolean);
    const response = await generateContentWithRetry(ai, {
      model: GEMINI_MODEL,
      contents: { parts: [...visualParts, { text: `Repair ONLY these parts: ${requested.join(", ")}. Brief: ${JSON.stringify(req.body.brief)}. Plan: ${JSON.stringify(plan)}. Current animal: ${JSON.stringify(current)}. Technical errors: ${JSON.stringify(req.body.validation?.issues || [])}. Visual review: ${JSON.stringify(req.body.review || null)}.` }] },
      config: {
        systemInstruction: `You repair isolated SVG animal parts. Return only fields for the explicitly requested parts; omit every accepted part. Never change name, description, color or accentColor. bodyConnections may be returned only when body is requested. Preserve the fixed coordinate contract and every required group id from the plan. Address only the supplied validation/review failures. Output compact valid inner SVG XML using primary/accent placeholders. This is bounded automatic repair round ${round} of 2. Prompt version ${PROMPT_VERSIONS.repair}.`,
        responseMimeType: "application/json",
        responseSchema: { type: Type.OBJECT, properties: { bodyConnections: animalDraftSchema.properties.bodyConnections, headSvg: { type: Type.STRING }, bodySvg: { type: Type.STRING }, frontLegsSvg: { type: Type.STRING }, backLegsSvg: { type: Type.STRING }, tailSvg: { type: Type.STRING } }, required: [] },
        temperature: 0.1,
      },
    });
    if (!response.text) throw new Error("Gemini returned an empty targeted repair.");
    const patch = JSON.parse(response.text) as Partial<AnimalDraft>;
    const { animal: merged, changedParts } = mergeTargetedRepair(current, patch, requested);
    const validation = validateAnimalDraft(merged, plan);
    return res.json({ animal: merged, validation, changedParts, requestedParts: requested, round, model: MODEL_VERSIONS.repair, promptVersion: PROMPT_VERSIONS.repair });
  } catch (error: any) {
    console.error("Error repairing custom animal via AI:", error);
    return res.status(500).json({ error: "Failed to repair creature parts. Details: " + getFriendlyErrorMessage(error) });
  }
});

// AI-driven custom animal modifier endpoint
app.post("/api/modify-animal", async (req, res) => {
  try {
    const { prompt, targetPart, currentAnimal, image } = req.body;
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

Your task is to modify an EXISTING custom animal/creature template based on the user's prompt or provided visual reference. If an inspiring image is provided, analyze its design, color schemes, themes, or traits to guide your modifications.
You can modify the whole creature, or focus your modifications on a specific body part if the user requested it.

The targeted body part to modify is: "${targetPart || "all"}". 
If targetPart is a specific part (like "head", "body", "frontLegs", "backLegs", or "tail"), you should focus your changes mainly on that part while preserving the other parts exactly as they are in the current creature, or make subtle adjustments if necessary.
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

    const promptText = prompt && prompt.trim() ? prompt.trim() : `Modify the ${targetPart || "all"} part of the creature inspired by the provided image.`;
    let contents: any;
    if (imagePart) {
      contents = {
        parts: [
          imagePart,
          { text: `Modify the current creature. Instruction: "${promptText}". Focus on part: "${targetPart || "all"}".` }
        ]
      };
    } else {
      contents = `Modify the current creature. Prompt instruction: "${promptText}". Focus on part: "${targetPart || "all"}".`;
    }

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Descriptive name (slightly modified if appropriate or kept same, or null if unchanged)" },
            color: { type: Type.STRING, description: "Base primary color in hex format (or null if unchanged)" },
            accentColor: { type: Type.STRING, description: "Accent/detail color in hex format (or null if unchanged)" },
            description: { type: Type.STRING, description: "A creative, short summary describing this species' updated traits (or null if unchanged)" },
            bodyConnections: {
              type: Type.OBJECT,
              properties: {
                neck: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body" },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body" }
                  },
                },
                tail: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body" },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body" }
                  },
                },
                frontLegs: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body" },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body" }
                  },
                },
                backLegs: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body" },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body" }
                  },
                }
              },
            },
            headSvg: { type: Type.STRING, description: "Updated SVG markup for head. Omit or return null if not modified." },
            bodySvg: { type: Type.STRING, description: "Updated SVG markup for body. Omit or return null if not modified." },
            frontLegsSvg: { type: Type.STRING, description: "Updated SVG markup for front legs. Omit or return null if not modified." },
            backLegsSvg: { type: Type.STRING, description: "Updated SVG markup for back legs. Omit or return null if not modified." },
            tailSvg: { type: Type.STRING, description: "Updated SVG markup for tail. Omit or return null if not modified." }
          },
          required: []
        },
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini model.");
    }

    const animalData = JSON.parse(text);
    
    // Safely merge changes with the current animal to build the completed animal data
    const mergedAnimal = {
      name: animalData.name || currentAnimal.name,
      color: animalData.color || currentAnimal.color,
      accentColor: animalData.accentColor || currentAnimal.accentColor,
      description: animalData.description || currentAnimal.description,
      bodyConnections: {
        neck: {
          x: animalData.bodyConnections?.neck?.x ?? currentAnimal.bodyConnections?.neck?.x ?? 75,
          y: animalData.bodyConnections?.neck?.y ?? currentAnimal.bodyConnections?.neck?.y ?? 90,
        },
        tail: {
          x: animalData.bodyConnections?.tail?.x ?? currentAnimal.bodyConnections?.tail?.x ?? 235,
          y: animalData.bodyConnections?.tail?.y ?? currentAnimal.bodyConnections?.tail?.y ?? 120,
        },
        frontLegs: {
          x: animalData.bodyConnections?.frontLegs?.x ?? currentAnimal.bodyConnections?.frontLegs?.x ?? 115,
          y: animalData.bodyConnections?.frontLegs?.y ?? currentAnimal.bodyConnections?.frontLegs?.y ?? 160,
        },
        backLegs: {
          x: animalData.bodyConnections?.backLegs?.x ?? currentAnimal.bodyConnections?.backLegs?.x ?? 235,
          y: animalData.bodyConnections?.backLegs?.y ?? currentAnimal.bodyConnections?.backLegs?.y ?? 160,
        },
      },
      headSvg: animalData.headSvg || currentAnimal.headSvg,
      bodySvg: animalData.bodySvg || currentAnimal.bodySvg,
      frontLegsSvg: animalData.frontLegsSvg || currentAnimal.frontLegsSvg,
      backLegsSvg: animalData.backLegsSvg || currentAnimal.backLegsSvg,
      tailSvg: animalData.tailSvg || currentAnimal.tailSvg,
    };

    return res.json(mergedAnimal);
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
