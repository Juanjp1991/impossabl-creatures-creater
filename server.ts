import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

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

// AI-driven custom animal generator endpoint
app.post("/api/generate-animal", async (req, res) => {
  try {
    const { prompt, image } = req.body;
    if ((!prompt || typeof prompt !== "string" || !prompt.trim()) && !image) {
      return res.status(400).json({ error: "A valid prompt or an inspiring image is required." });
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
Your task is to generate a complete custom animal/creature template. If an inspiring image is provided in the input, analyze its subject, features, colors, pose, and aesthetic style, and use them as direct visual inspiration to craft the custom creature.

CRITICAL SVG COORDINATE SPACE AND CONNECTION AGREEMENTS:
1. HEAD: viewBox is "0 0 160 160".
   - The connection point where the neck/head attaches to the body is fixed at local (120, 110). Design the head's base neck connection to meet exactly at (120, 110).
   - Draw details like eyes, ears, mouth, snout, nose, highlights, or horns.
2. BODY: viewBox is "0 0 300 220".
   - Choose four connection pivot coordinates (X, Y relative to the body's 300x220 space) where other parts attach:
     * neck: typically X=40 to 120, Y=50 to 130.
     * tail: typically X=200 to 280, Y=80 to 160.
     * frontLegs: typically X=70 to 140, Y=130 to 190 (the front shoulder pivot).
     * backLegs: typically X=180 to 250, Y=130 to 190 (the rear hip pivot).
   - Draw the main body torso. Make it muscular, fluffy, sleek, or stout.
3. FRONT LEGS: viewBox is "0 0 260 180".
   - The connection point where the front legs join the body is fixed at local (75, 15). Design the top of the shoulder to meet at (75, 15).
   - Draw front-layer legs (using "primary" color) and back-layer legs (darker/shaded, with slightly reduced opacity, e.g. 0.8) to represent the front limbs.
4. BACK LEGS: viewBox is "0 0 260 180".
   - The connection point where the back legs join the body is fixed at local (195, 15). Design the top of the hip to meet at (195, 15).
   - Draw front-layer legs (using "primary" color) and back-layer legs (darker/shaded, with slightly reduced opacity, e.g. 0.8) to represent the back limbs.
5. TAIL: viewBox is "0 0 160 160".
   - The connection point where the tail joins the body is fixed at local (15, 15). Design the tail's base to meet exactly at (15, 15).
   - Draw a gorgeous, matching tail (e.g., fluffy, scaled, thin, feathered).

STYLING & COLOR CONVENTIONS:
- Generate a beautiful primary base hex color ("color") and an accent hex color ("accentColor") for the creature.
- Inside the SVG strings ("headSvg", "bodySvg", "frontLegsSvg", "backLegsSvg", "tailSvg"), do NOT hardcode the hex colors you generate. Instead, use the literal value "primary" (e.g., fill="primary" or stroke="primary") for elements that should use the primary color, and the literal value "accent" (e.g., fill="accent") for elements using the accent color. This enables dynamic color customizations on the frontend.
- You can hardcode other colors for details (e.g., "#111111" for pupils, "#ffffff" for highlights, soft pinks/oranges for cheeks, translucent shadows with opacity, or dark tones for outlines like stroke="#221100").
- Use valid SVG tags: <g>, <path>, <circle>, <rect>, <ellipse>, <polygon>, <polyline>, <line>, <defs>, <linearGradient>, <stop>.
- Always close all tags properly. Do NOT wrap the code in <svg> tags, just return the inner elements inside a group <g> or as flat tags. Make sure the SVGs look incredibly polished and organic (lots of smooth bezier curves 'C' or quadratic 'Q', not just boxes).
- To prevent timeout and ensure fast rendering, keep SVG path coordinates clean, compact, and minimized. Avoid excessive details or redundant path points. A highly-detailed look is best achieved with a few elegant, well-designed curves rather than massive coordinates.`;

    const promptText = prompt && prompt.trim() ? prompt.trim() : "Create a beautiful custom creature inspired by the provided image.";
    let contents: any;
    if (imagePart) {
      contents = {
        parts: [
          imagePart,
          { text: `Create an SVG creature matching this instruction: "${promptText}"` }
        ]
      };
    } else {
      contents = `Create an SVG creature matching this prompt: "${promptText}"`;
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
            name: { type: Type.STRING, description: "Descriptive name, e.g. Neon Phoenix" },
            color: { type: Type.STRING, description: "Base primary color in hex format, e.g. #FF5500" },
            accentColor: { type: Type.STRING, description: "Accent/detail color in hex format, e.g. #FFD700" },
            description: { type: Type.STRING, description: "A creative, short summary describing this species' traits" },
            bodyConnections: {
              type: Type.OBJECT,
              properties: {
                neck: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body (from 0 to 300) where the neck attaches. Usually 40 to 120." },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body (from 0 to 220) where the neck attaches. Usually 50 to 130." }
                  },
                  required: ["x", "y"]
                },
                tail: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body (from 0 to 300) where the tail attaches. Usually 200 to 280." },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body (from 0 to 220) where the tail attaches. Usually 80 to 160." }
                  },
                  required: ["x", "y"]
                },
                frontLegs: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body where front shoulder connects. Usually 70 to 140." },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body where front shoulder connects. Usually 130 to 190." }
                  },
                  required: ["x", "y"]
                },
                backLegs: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.INTEGER, description: "Pivot X on the body where rear hip connects. Usually 180 to 250." },
                    y: { type: Type.INTEGER, description: "Pivot Y on the body where rear hip connects. Usually 130 to 190." }
                  },
                  required: ["x", "y"]
                }
              },
              required: ["neck", "tail", "frontLegs", "backLegs"]
            },
            headSvg: { type: Type.STRING, description: "Inner SVG markup (e.g. wrapped in <g>) for head (160x160 space). Uses 'primary' and 'accent' fills." },
            bodySvg: { type: Type.STRING, description: "Inner SVG markup (e.g. wrapped in <g>) for body (300x220 space). Uses 'primary' and 'accent' fills." },
            frontLegsSvg: { type: Type.STRING, description: "Inner SVG markup (e.g. wrapped in <g>) for front legs (260x180 space). Uses 'primary' and 'accent' fills." },
            backLegsSvg: { type: Type.STRING, description: "Inner SVG markup (e.g. wrapped in <g>) for back legs (260x180 space). Uses 'primary' and 'accent' fills." },
            tailSvg: { type: Type.STRING, description: "Inner SVG markup (e.g. wrapped in <g>) for tail (160x160 space). Uses 'primary' and 'accent' fills." }
          },
          required: ["name", "color", "accentColor", "description", "bodyConnections", "headSvg", "bodySvg", "frontLegsSvg", "backLegsSvg", "tailSvg"]
        },
        temperature: 0.2,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini model.");
    }

    const animalData = JSON.parse(text);
    return res.json(animalData);
  } catch (error: any) {
    console.error("Error generating custom animal via AI:", error);
    return res.status(500).json({
      error: "Failed to generate creature SVG. Details: " + getFriendlyErrorMessage(error),
    });
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
      server: { middlewareMode: true },
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
