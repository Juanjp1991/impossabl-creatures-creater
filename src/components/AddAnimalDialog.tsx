import React, { useState, useEffect, useMemo } from "react";
import { X, Sparkles, HelpCircle, Info, FileText, Wand2, Loader2, Compass, Move, RotateCw, Settings, Grid, SlidersHorizontal, RefreshCw, Layers, Upload, Image, Trash2 } from "lucide-react";
import { Animal } from "../types";
import { parseSvgToReact, getSvgShapes, ShapeTransform } from "../utils/svgParser";

interface AddAnimalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAnimal: (animal: Animal) => void;
  editingAnimal?: Animal | null;
}

// Preset animal templates for effortless creation with split front and back legs
const TEMPLATES = [
  {
    name: "Chimeric Dino",
    color: "#10B981",
    accentColor: "#F59E0B",
    description: "A gentle forest giant from the prehistoric era with thick back-spikes and heavy stomping legs.",
    neckX: 70, neckY: 70,
    tailX: 260, tailY: 120,
    frontLegsX: 110, frontLegsY: 160,
    backLegsX: 210, backLegsY: 160,
    headSvg: `<g>
  <!-- Dino Head -->
  <path d="M 110,95 C 125,85 120,55 105,45 C 90,35 65,40 50,50 C 35,60 25,75 32,95 C 38,110 65,115 85,110 C 100,105 105,100 110,95 Z" fill="primary" stroke="#064e3b" stroke-width="2" />
  <!-- Spikes -->
  <path d="M 85,38 L 95,25 L 100,42 M 65,44 L 72,30 L 80,48" fill="accent" stroke="#064e3b" stroke-width="1.5" />
  <!-- Snout & Mouth -->
  <path d="M 32,95 Q 45,102 55,95" fill="none" stroke="#064e3b" stroke-width="2" />
  <circle cx="38" cy="85" r="3" fill="#111" />
  <!-- Cute Dino Eye -->
  <circle cx="75" cy="70" r="5" fill="#111" />
  <circle cx="73.5" cy="68.5" r="1.5" fill="#fff" />
</g>`,
    bodySvg: `<g>
  <!-- Dino Body -->
  <path d="M 70,70 C 70,70 85,50 115,45 C 145,40 185,45 220,60 C 255,75 260,110 260,120 C 260,150 240,180 200,180 C 160,180 125,175 105,165 C 85,155 70,125 70,95 Z" fill="primary" stroke="#064e3b" stroke-width="2.5" />
  <!-- Spine Plates/Spikes -->
  <path d="M 105,45 L 115,25 L 125,43" fill="accent" stroke="#064e3b" stroke-width="1.5" />
  <path d="M 145,40 L 155,20 L 165,39" fill="accent" stroke="#064e3b" stroke-width="1.5" />
  <path d="M 185,45 L 195,25 L 205,48" fill="accent" stroke="#064e3b" stroke-width="1.5" />
  <path d="M 225,62 L 235,42 L 243,68" fill="accent" stroke="#064e3b" stroke-width="1.5" />
</g>`,
    frontLegsSvg: `<g>
  <!-- Front Leg (Back Layer) -->
  <path d="M 60,30 C 55,55 58,85 62,115 C 65,135 60,165 52,195 L 42,195 L 42,202 L 72,202 C 77,175 82,145 80,115 Z" fill="#047857" opacity="0.8" />
  <!-- Front Leg (Front Layer) -->
  <path d="M 80,20 C 72,45 70,75 76,110 C 80,135 72,170 64,200 L 52,200 Q 52,208 68,208 L 92,208 Q 98,185 96,150 Z" fill="primary" stroke="#064e3b" stroke-width="2" />
</g>`,
    backLegsSvg: `<g>
  <!-- Back Leg (Back Layer) -->
  <path d="M 170,30 C 155,55 150,85 155,115 C 158,135 154,165 146,195 L 136,195 L 136,202 L 166,202 C 171,175 176,145 175,115 Z" fill="#047857" opacity="0.8" />
  <!-- Back Leg (Front Layer) -->
  <path d="M 200,20 C 185,45 175,75 182,110 C 186,135 178,170 170,200 L 158,200 Q 158,208 174,208 L 198,208 Q 204,185 202,150 Z" fill="primary" stroke="#064e3b" stroke-width="2" />
</g>`,
    tailSvg: `<g>
  <!-- Dino Tail -->
  <path d="M 15,15 C 35,25 65,25 90,40 C 115,55 135,75 150,110 C 155,120 145,125 135,115 C 120,100 105,80 85,65 C 65,50 45,30 15,15 Z" fill="primary" stroke="#064e3b" stroke-width="1.5" />
  <!-- Tail Spikes -->
  <path d="M 65,27 L 72,12 L 78,31" fill="accent" stroke="#064e3b" stroke-width="1.5" />
  <path d="M 95,43 L 102,28 L 108,48" fill="accent" stroke="#064e3b" stroke-width="1.5" />
</g>`
  },
  {
    name: "Cosmic Bunny",
    color: "#A78BFA",
    accentColor: "#F472B6",
    description: "A cute neon cosmic bunny with tall radio ears and extremely fluffy joints.",
    neckX: 75, neckY: 75,
    tailX: 260, tailY: 110,
    frontLegsX: 110, frontLegsY: 160,
    backLegsX: 210, backLegsY: 160,
    headSvg: `<g>
  <!-- Long Ears -->
  <path d="M 95,50 C 90,15 110,10 110,40 C 110,60 102,70 95,50 Z" fill="primary" stroke="#4c1d95" stroke-width="1.5" />
  <path d="M 98,45 C 95,20 105,18 105,38 C 105,52 100,58 98,45 Z" fill="accent" />
  <path d="M 75,55 C 65,20 85,15 88,45 C 88,62 82,72 75,55 Z" fill="primary" stroke="#4c1d95" stroke-width="1.5" />
  <path d="M 78,50 C 71,25 81,20 83,42 C 83,55 79,63 78,50 Z" fill="accent" />

  <!-- Head Round Shape -->
  <circle cx="75" cy="85" r="35" fill="primary" stroke="#4c1d95" stroke-width="2" />
  
  <!-- Big Anime Eyes -->
  <circle cx="60" cy="80" r="6" fill="#111" />
  <circle cx="58" cy="78" r="2" fill="#fff" />
  <circle cx="61" cy="82" r="1" fill="#fff" />
  
  <circle cx="85" cy="80" r="6" fill="#111" />
  <circle cx="83" cy="78" r="2" fill="#fff" />
  <circle cx="86" cy="82" r="1" fill="#fff" />

  <!-- Pink Nose & Cheeks -->
  <polygon points="72,88 78,88 75,91" fill="accent" />
  <circle cx="50" cy="88" r="4" fill="accent" opacity="0.6" />
  <circle cx="95" cy="88" r="4" fill="accent" opacity="0.6" />
  
  <!-- Mouth -->
  <path d="M 71,93 Q 75,96 79,93" fill="none" stroke="#4c1d95" stroke-width="1.5" />
</g>`,
    bodySvg: `<g>
  <!-- Fluffy Bunny Body -->
  <path d="M 75,75 C 75,75 90,60 115,55 C 145,50 185,55 210,70 C 235,85 245,110 245,120 C 245,150 230,175 195,175 C 160,175 130,170 110,160 C 90,150 75,120 75,95 Z" fill="primary" stroke="#4c1d95" stroke-width="2" />
  <!-- Fluffy neck ruff detail -->
  <path d="M 80,85 C 90,95 100,85 105,95 C 110,85 115,95 125,85" fill="none" stroke="#4c1d95" stroke-width="1.5" />
</g>`,
    frontLegsSvg: `<g>
  <!-- Bunny Front Leg Back Layer -->
  <path d="M 60,40 C 55,65 58,95 62,125 C 65,145 55,175 45,195 L 35,195 L 35,202 L 65,202 C 70,175 75,145 73,125 Z" fill="#6d28d9" opacity="0.8" />
  <!-- Bunny Front Leg Front Layer (Fluffy paws) -->
  <path d="M 80,30 C 72,55 70,85 76,120 C 80,145 70,175 60,200 L 48,200 Q 48,206 62,206 L 82,206 Q 88,185 86,150 Z" fill="primary" stroke="#4c1d95" stroke-width="2" />
</g>`,
    backLegsSvg: `<g>
  <!-- Bunny Back Leg Back Layer -->
  <path d="M 170,40 C 150,65 145,95 152,125 C 155,145 140,175 130,195 L 120,195 L 120,202 L 150,202 C 155,175 162,145 160,125 Z" fill="#6d28d9" opacity="0.8" />
  <!-- Bunny Back Leg Front Layer (Fluffy paws) -->
  <path d="M 195,30 C 180,55 170,85 178,120 C 182,145 165,175 155,200 L 142,200 Q 142,206 156,206 L 176,206 Q 182,185 180,150 Z" fill="primary" stroke="#4c1d95" stroke-width="2" />
</g>`,
    tailSvg: `<g>
  <!-- Super Fluffy Bunny Tail -->
  <path d="M 10,25 C 5,12 25,2 35,12 C 45,2 58,15 52,28 C 58,38 42,48 30,42 C 18,48 5,38 10,25 Z" fill="primary" stroke="#4c1d95" stroke-width="1.5" />
  <circle cx="30" cy="22" r="10" fill="accent" opacity="0.8" />
</g>`
  }
];

export function AddAnimalDialog({ isOpen, onClose, onAddAnimal, editingAnimal }: AddAnimalDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [accentColor, setAccentColor] = useState("#F59E0B");
  const [description, setDescription] = useState("");
  
  // Connection point offsets
  const [neckX, setNeckX] = useState(75);
  const [neckY, setNeckY] = useState(90);
  const [tailX, setTailX] = useState(260);
  const [tailY, setTailY] = useState(105);
  const [frontLegsX, setFrontLegsX] = useState(115);
  const [frontLegsY, setFrontLegsY] = useState(160);
  const [backLegsX, setBackLegsX] = useState(235);
  const [backLegsY, setBackLegsY] = useState(160);

  // SVG strings for parts
  const [headSvg, setHeadSvg] = useState("");
  const [bodySvg, setBodySvg] = useState("");
  const [frontLegsSvg, setFrontLegsSvg] = useState("");
  const [backLegsSvg, setBackLegsSvg] = useState("");
  const [tailSvg, setTailSvg] = useState("");

  // Sub-shape adjustment states
  const [shapeAdjustments, setShapeAdjustments] = useState<Record<"head" | "body" | "frontLegs" | "backLegs" | "tail", Record<number, ShapeTransform>>>({
    head: {},
    body: {},
    frontLegs: {},
    backLegs: {},
    tail: {},
  });
  const [activeShapeIndex, setActiveShapeIndex] = useState<number | null>(null);

  const [errorMsg, setErrorMsg] = useState("");

  // AI Generation State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image size should be less than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result as string);
      setErrorMsg("");
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read the image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  };

  // Preview settings states
  const [showPreviewGrid, setShowPreviewGrid] = useState(true);
  const [showPreviewSkeleton, setShowPreviewSkeleton] = useState(true);

  // Active fine-tuning part (supports head, body, frontLegs, backLegs, tail)
  const [activeTweakPart, setActiveTweakPart] = useState<"head" | "body" | "frontLegs" | "backLegs" | "tail">("head");

  // Fine-tuning states for Head (viewBox: 160x160)
  const [headTx, setHeadTx] = useState(0);
  const [headTy, setHeadTy] = useState(0);
  const [headRot, setHeadRot] = useState(0);
  const [headScale, setHeadScale] = useState(1);
  const [headPivotX, setHeadPivotX] = useState(80);
  const [headPivotY, setHeadPivotY] = useState(80);

  // Fine-tuning states for Body (viewBox: 300x220)
  const [bodyTx, setBodyTx] = useState(0);
  const [bodyTy, setBodyTy] = useState(0);
  const [bodyRot, setBodyRot] = useState(0);
  const [bodyScale, setBodyScale] = useState(1);
  const [bodyPivotX, setBodyPivotX] = useState(150);
  const [bodyPivotY, setBodyPivotY] = useState(110);

  // Fine-tuning states for Front Legs (viewBox: 260x180)
  const [frontLegsTx, setFrontLegsTx] = useState(0);
  const [frontLegsTy, setFrontLegsTy] = useState(0);
  const [frontLegsRot, setFrontLegsRot] = useState(0);
  const [frontLegsScale, setFrontLegsScale] = useState(1);
  const [frontLegsPivotX, setFrontLegsPivotX] = useState(130);
  const [frontLegsPivotY, setFrontLegsPivotY] = useState(90);

  // Fine-tuning states for Back Legs (viewBox: 260x180)
  const [backLegsTx, setBackLegsTx] = useState(0);
  const [backLegsTy, setBackLegsTy] = useState(0);
  const [backLegsRot, setBackLegsRot] = useState(0);
  const [backLegsScale, setBackLegsScale] = useState(1);
  const [backLegsPivotX, setBackLegsPivotX] = useState(130);
  const [backLegsPivotY, setBackLegsPivotY] = useState(90);

  // Fine-tuning states for Tail (viewBox: 160x160)
  const [tailTx, setTailTx] = useState(0);
  const [tailTy, setTailTy] = useState(0);
  const [tailRot, setTailRot] = useState(0);
  const [tailScale, setTailScale] = useState(1);
  const [tailPivotX, setTailPivotX] = useState(80);
  const [tailPivotY, setTailPivotY] = useState(80);

  // AI Refinement states
  const [aiMode, setAiMode] = useState<"summon" | "refine">("summon");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [refinePart, setRefinePart] = useState<"all" | "head" | "body" | "frontLegs" | "backLegs" | "tail">("all");

  // Pre-populate fields when editing an existing animal
  useEffect(() => {
    if (isOpen) {
      if (editingAnimal) {
        setName(editingAnimal.name);
        setColor(editingAnimal.color);
        setAccentColor(editingAnimal.accentColor);
        setDescription(editingAnimal.description);
        
        setNeckX(editingAnimal.bodyConnections.neck.x);
        setNeckY(editingAnimal.bodyConnections.neck.y);
        setTailX(editingAnimal.bodyConnections.tail.x);
        setTailY(editingAnimal.bodyConnections.tail.y);
        setFrontLegsX(editingAnimal.bodyConnections.frontLegs?.x ?? 115);
        setFrontLegsY(editingAnimal.bodyConnections.frontLegs?.y ?? 160);
        setBackLegsX(editingAnimal.bodyConnections.backLegs?.x ?? 235);
        setBackLegsY(editingAnimal.bodyConnections.backLegs?.y ?? 160);

        setHeadSvg(editingAnimal.parts.head.rawContent);
        setBodySvg(editingAnimal.parts.body.rawContent);
        setFrontLegsSvg(editingAnimal.parts.frontLegs?.rawContent || (editingAnimal.parts as any).legs?.rawContent || "");
        setBackLegsSvg(editingAnimal.parts.backLegs?.rawContent || (editingAnimal.parts as any).legs?.rawContent || "");
        setTailSvg(editingAnimal.parts.tail.rawContent);

        // Reset part alignments for edited template
        setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
        setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
        setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
        setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
        setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
        
        // Reset sub-shape adjustments
        setShapeAdjustments({ head: {}, body: {}, frontLegs: {}, backLegs: {}, tail: {} });
        setActiveShapeIndex(null);
        setActiveTweakPart("head");
        setErrorMsg("");
      } else {
        // Reset to initial empty state
        setName("");
        setColor("#3B82F6");
        setAccentColor("#F59E0B");
        setDescription("");
        setNeckX(75);
        setNeckY(90);
        setTailX(260);
        setTailY(105);
        setFrontLegsX(115);
        setFrontLegsY(160);
        setBackLegsX(235);
        setBackLegsY(160);
        setHeadSvg("");
        setBodySvg("");
        setFrontLegsSvg("");
        setBackLegsSvg("");
        setTailSvg("");
        setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
        setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
        setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
        setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
        setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
        setShapeAdjustments({ head: {}, body: {}, frontLegs: {}, backLegs: {}, tail: {} });
        setActiveShapeIndex(null);
        setActiveTweakPart("head");
        setErrorMsg("");
      }
    }
  }, [isOpen, editingAnimal]);

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim() && !uploadedImage) {
      setErrorMsg("Please enter an animal description or upload an inspiring image first.");
      return;
    }

    setIsGenerating(true);
    setErrorMsg("");
    setGenerationStep("Contacting Gemini 3.5 Flash...");

    try {
      const timers = [
        setTimeout(() => setGenerationStep("Drafting unique creature biology..."), 1200),
        setTimeout(() => setGenerationStep("Forging vector coordinates for custom parts..."), 3000),
        setTimeout(() => setGenerationStep("Aligning joints for head, legs, and tail..."), 5000),
        setTimeout(() => setGenerationStep("Polishing SVG paths..."), 7000),
      ];

      const response = await fetch("/api/generate-animal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          prompt: aiPrompt.trim(),
          image: uploadedImage,
        }),
      });

      timers.forEach(t => clearTimeout(t));

      if (!response.ok) {
        let errMsg = `Server returned error status ${response.status}`;
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errMsg;
          } catch {
            if (text.includes("<!doctype html>") || text.includes("<html")) {
              errMsg = `Server error (${response.status}): The server is temporarily busy or returned an HTML error page. Please try again.`;
            } else {
              errMsg = text.substring(0, 150) || errMsg;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => {
        throw new Error("Failed to parse the generated creature JSON data from the server.");
      });
      
      setName(data.name || "");
      setColor(data.color || "#cccccc");
      setAccentColor(data.accentColor || "#ffaa00");
      setDescription(data.description || "");
      
      if (data.bodyConnections) {
        if (data.bodyConnections.neck) {
          setNeckX(data.bodyConnections.neck.x ?? 75);
          setNeckY(data.bodyConnections.neck.y ?? 90);
        }
        if (data.bodyConnections.tail) {
          setTailX(data.bodyConnections.tail.x ?? 260);
          setTailY(data.bodyConnections.tail.y ?? 105);
        }
        if (data.bodyConnections.frontLegs) {
          setFrontLegsX(data.bodyConnections.frontLegs.x ?? 115);
          setFrontLegsY(data.bodyConnections.frontLegs.y ?? 160);
        }
        if (data.bodyConnections.backLegs) {
          setBackLegsX(data.bodyConnections.backLegs.x ?? 235);
          setBackLegsY(data.bodyConnections.backLegs.y ?? 160);
        }
      }

      setHeadSvg(data.headSvg || "");
      setBodySvg(data.bodySvg || "");
      setFrontLegsSvg(data.frontLegsSvg || "");
      setBackLegsSvg(data.backLegsSvg || "");
      setTailSvg(data.tailSvg || "");

      // Reset transform adjustments for fresh generation
      setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
      setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
      setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
      setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
      setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
      setActiveTweakPart("head");

      setAiPrompt("");
      setAiMode("refine"); // Auto-switch to refine mode upon successful generation
      setGenerationStep("Success! Animal draft generated below. Feel free to tweak and forge!");
      setTimeout(() => setGenerationStep(""), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "An unexpected error occurred during generation. Make sure GEMINI_API_KEY is configured.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineWithAI = async () => {
    if (!refinePrompt.trim() && !uploadedImage) {
      setErrorMsg("Please enter refinement instructions or upload an inspiring image.");
      return;
    }

    setIsGenerating(true);
    setErrorMsg("");
    setGenerationStep(`Refining ${refinePart === "all" ? "the entire creature" : refinePart} with Gemini 3.5 Flash...`);

    try {
      const timers = [
        setTimeout(() => setGenerationStep("Analyzing existing creature anatomy..."), 1200),
        setTimeout(() => setGenerationStep("Re-drawing vector coordinates for selected parts..."), 3000),
        setTimeout(() => setGenerationStep("Re-aligning joints and connections..."), 5000),
        setTimeout(() => setGenerationStep("Polishing final vector outputs..."), 7000),
      ];

      const response = await fetch("/api/modify-animal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: refinePrompt.trim(),
          targetPart: refinePart,
          image: uploadedImage,
          currentAnimal: {
            name,
            color,
            accentColor,
            description,
            bodyConnections: {
              neck: { x: neckX, y: neckY },
              tail: { x: tailX, y: tailY },
              frontLegs: { x: frontLegsX, y: frontLegsY },
              backLegs: { x: backLegsX, y: backLegsY }
            },
            headSvg,
            bodySvg,
            frontLegsSvg,
            backLegsSvg,
            tailSvg
          }
        }),
      });

      timers.forEach(t => clearTimeout(t));

      if (!response.ok) {
        let errMsg = `Server returned error status ${response.status}`;
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errMsg;
          } catch {
            if (text.includes("<!doctype html>") || text.includes("<html")) {
              errMsg = `Server error (${response.status}): The server is temporarily busy or returned an HTML error page. Please try again.`;
            } else {
              errMsg = text.substring(0, 150) || errMsg;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => {
        throw new Error("Failed to parse the modified creature JSON data from the server.");
      });
      
      setName(data.name || name);
      setColor(data.color || color);
      setAccentColor(data.accentColor || accentColor);
      setDescription(data.description || description);
      
      if (data.bodyConnections) {
        if (data.bodyConnections.neck) {
          setNeckX(data.bodyConnections.neck.x ?? neckX);
          setNeckY(data.bodyConnections.neck.y ?? neckY);
        }
        if (data.bodyConnections.tail) {
          setTailX(data.bodyConnections.tail.x ?? tailX);
          setTailY(data.bodyConnections.tail.y ?? tailY);
        }
        if (data.bodyConnections.frontLegs) {
          setFrontLegsX(data.bodyConnections.frontLegs.x ?? frontLegsX);
          setFrontLegsY(data.bodyConnections.frontLegs.y ?? frontLegsY);
        }
        if (data.bodyConnections.backLegs) {
          setBackLegsX(data.bodyConnections.backLegs.x ?? backLegsX);
          setBackLegsY(data.bodyConnections.backLegs.y ?? backLegsY);
        }
      }

      setHeadSvg(data.headSvg || headSvg);
      setBodySvg(data.bodySvg || bodySvg);
      setFrontLegsSvg(data.frontLegsSvg || frontLegsSvg);
      setBackLegsSvg(data.backLegsSvg || backLegsSvg);
      setTailSvg(data.tailSvg || tailSvg);

      setRefinePrompt("");
      setGenerationStep(`Success! Iterative modification applied to ${refinePart === "all" ? "creature" : refinePart}.`);
      setTimeout(() => setGenerationStep(""), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "An unexpected error occurred during refinement. Make sure GEMINI_API_KEY is configured.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyTemplate = (index: number) => {
    const template = TEMPLATES[index];
    setName(template.name);
    setColor(template.color);
    setAccentColor(template.accentColor);
    setDescription(template.description);
    setNeckX(template.neckX);
    setNeckY(template.neckY);
    setTailX(template.tailX);
    setTailY(template.tailY);
    setFrontLegsX(template.frontLegsX);
    setFrontLegsY(template.frontLegsY);
    setBackLegsX(template.backLegsX);
    setBackLegsY(template.backLegsY);
    setHeadSvg(template.headSvg);
    setBodySvg(template.bodySvg);
    setFrontLegsSvg(template.frontLegsSvg);
    setBackLegsSvg(template.backLegsSvg);
    setTailSvg(template.tailSvg);
    setErrorMsg("");

    // Reset transform adjustments for fresh template
    setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
    setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
    setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
    setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
    setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
    setActiveTweakPart("head");
  };

  const validateAndSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Please provide a name for your custom animal.");
      return;
    }
    if (!headSvg.trim() || !bodySvg.trim() || !frontLegsSvg.trim() || !backLegsSvg.trim() || !tailSvg.trim()) {
      setErrorMsg("All five part SVGs (Head, Body, Front Legs, Back Legs, Tail) must be populated.");
      return;
    }

    // Helper to bake the custom transformations into the raw SVG strings via group wraps
    const wrapWithTransform = (svg: string, tx: number, ty: number, rot: number, scale: number, px: number, py: number) => {
      const trimmed = svg.trim();
      if (!trimmed) return "";
      if (tx === 0 && ty === 0 && rot === 0 && scale === 1) {
        return trimmed;
      }
      const transformAttr = `translate(${tx}, ${ty}) translate(${px}, ${py}) scale(${scale}) translate(${-px}, ${-py}) rotate(${rot}, ${px}, ${py})`;
      return `<g transform="${transformAttr}">${trimmed}</g>`;
    };

    const applyShapeTransformsToSvg = (
      svgString: string,
      transforms: Record<number, ShapeTransform>
    ): string => {
      if (!svgString.trim()) return "";
      if (!transforms || Object.keys(transforms).length === 0) return svgString;

      try {
        const parser = new DOMParser();
        const wrapped = `<g>${svgString}</g>`;
        const doc = parser.parseFromString(wrapped, "image/svg+xml");
        
        let shapeCounter = 0;
        const isAdjustableTag = (tag: string) => 
          ["path", "circle", "rect", "ellipse", "polygon", "polyline", "line", "g"].includes(tag);

        function traverseAndTransform(node: Element) {
          const tagName = node.tagName.toLowerCase();
          if (isAdjustableTag(tagName)) {
            const currentIdx = shapeCounter++;
            const t = transforms[currentIdx];
            if (t) {
              let tString = "";
              if (t.translateX !== 0 || t.translateY !== 0) {
                tString += `translate(${t.translateX}, ${t.translateY}) `;
              }
              if (t.rotate !== 0) {
                tString += `rotate(${t.rotate}) `;
              }
              if (t.scale !== 1) {
                tString += `scale(${t.scale}) `;
              }
              tString = tString.trim();

              if (tString) {
                const existing = node.getAttribute("transform") || "";
                node.setAttribute("transform", existing ? `${existing} ${tString}`.trim() : tString);
              }

              if (t.fill) {
                node.setAttribute("fill", t.fill);
              }
            }
          }

          node.childNodes.forEach((child) => {
            if (child.nodeType === Node.ELEMENT_NODE) {
              traverseAndTransform(child as Element);
            }
          });
        }

        traverseAndTransform(doc.documentElement);

        const serializer = new XMLSerializer();
        const serialized = serializer.serializeToString(doc.documentElement);
        const innerContent = serialized.replace(/^<g[^>]*>/, "").replace(/<\/g>$/, "");
        return innerContent;
      } catch (err) {
        console.error("Failed to bake shape transforms:", err);
        return svgString;
      }
    };

    const bakedHeadSvg = applyShapeTransformsToSvg(headSvg, shapeAdjustments.head);
    const bakedBodySvg = applyShapeTransformsToSvg(bodySvg, shapeAdjustments.body);
    const bakedFrontLegsSvg = applyShapeTransformsToSvg(frontLegsSvg, shapeAdjustments.frontLegs);
    const bakedBackLegsSvg = applyShapeTransformsToSvg(backLegsSvg, shapeAdjustments.backLegs);
    const bakedTailSvg = applyShapeTransformsToSvg(tailSvg, shapeAdjustments.tail);

    const finalHeadSvg = wrapWithTransform(bakedHeadSvg, headTx, headTy, headRot, headScale, headPivotX, headPivotY);
    const finalBodySvg = wrapWithTransform(bakedBodySvg, bodyTx, bodyTy, bodyRot, bodyScale, bodyPivotX, bodyPivotY);
    const finalFrontLegsSvg = wrapWithTransform(bakedFrontLegsSvg, frontLegsTx, frontLegsTy, frontLegsRot, frontLegsScale, frontLegsPivotX, frontLegsPivotY);
    const finalBackLegsSvg = wrapWithTransform(bakedBackLegsSvg, backLegsTx, backLegsTy, backLegsRot, backLegsScale, backLegsPivotX, backLegsPivotY);
    const finalTailSvg = wrapWithTransform(bakedTailSvg, tailTx, tailTy, tailRot, tailScale, tailPivotX, tailPivotY);

    const animalId = editingAnimal && editingAnimal.id.startsWith("custom-")
      ? editingAnimal.id
      : "custom-" + name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();

    const newAnimal: Animal = {
      id: animalId,
      name: name.trim(),
      color,
      accentColor,
      description: description.trim() || `A customized user hybrid template representing a ${name}.`,
      bodyConnections: {
        neck: { x: neckX, y: neckY },
        tail: { x: tailX, y: tailY },
        frontLegs: { x: frontLegsX, y: frontLegsY },
        backLegs: { x: backLegsX, y: backLegsY },
      },
      parts: {
        head: {
          id: `${animalId}-head`,
          animalId,
          type: "head",
          name: `${name} Head`,
          viewBox: "0 0 160 160",
          connections: {
            neck: { x: 120, y: 110 },
          },
          render: () => null, 
          rawContent: finalHeadSvg.trim(),
        },
        body: {
          id: `${animalId}-body`,
          animalId,
          type: "body",
          name: `${name} Body`,
          viewBox: "0 0 300 220",
          connections: {},
          render: () => null,
          rawContent: finalBodySvg.trim(),
        },
        frontLegs: {
          id: `${animalId}-frontLegs`,
          animalId,
          type: "frontLegs",
          name: `${name} Front Legs`,
          viewBox: "0 0 260 180",
          connections: {
            body: { x: 75, y: 15 },
          },
          render: () => null,
          rawContent: finalFrontLegsSvg.trim(),
        },
        backLegs: {
          id: `${animalId}-backLegs`,
          animalId,
          type: "backLegs",
          name: `${name} Back Legs`,
          viewBox: "0 0 260 180",
          connections: {
            body: { x: 195, y: 15 },
          },
          render: () => null,
          rawContent: finalBackLegsSvg.trim(),
        },
        tail: {
          id: `${animalId}-tail`,
          animalId,
          type: "tail",
          name: `${name} Tail`,
          viewBox: "0 0 160 160",
          connections: {
            body: { x: 15, y: 15 },
          },
          render: () => null,
          rawContent: finalTailSvg.trim(),
        },
      },
    };

    onAddAnimal(newAnimal);
    onClose();

    // Reset fields & transforms
    setName("");
    setDescription("");
    setHeadSvg("");
    setBodySvg("");
    setFrontLegsSvg("");
    setBackLegsSvg("");
    setTailSvg("");
    setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
    setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
    setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
    setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
    setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
    setActiveTweakPart("head");
  };

  // Helper to get active transform state and setter
  const getActiveTransform = () => {
    switch (activeTweakPart) {
      case "head":
        return {
          tx: headTx, setTx: setHeadTx,
          ty: headTy, setTy: setHeadTy,
          rot: headRot, setRot: setHeadRot,
          scale: headScale, setScale: setHeadScale,
          px: headPivotX, setPx: setHeadPivotX,
          py: headPivotY, setPy: setHeadPivotY,
          viewBoxMaxX: 160, viewBoxMaxY: 160
        };
      case "body":
        return {
          tx: bodyTx, setTx: setBodyTx,
          ty: bodyTy, setTy: setHeadTy, // wait, map to correct setter
          rot: bodyRot, setRot: setBodyRot,
          scale: bodyScale, setScale: setBodyScale,
          px: bodyPivotX, setPx: setBodyPivotX,
          py: bodyPivotY, setPy: setBodyPivotY,
          viewBoxMaxX: 300, viewBoxMaxY: 220
        };
      case "frontLegs":
        return {
          tx: frontLegsTx, setTx: setFrontLegsTx,
          ty: frontLegsTy, setTy: setFrontLegsTy,
          rot: frontLegsRot, setRot: setFrontLegsRot,
          scale: frontLegsScale, setScale: setFrontLegsScale,
          px: frontLegsPivotX, setPx: setFrontLegsPivotX,
          py: frontLegsPivotY, setPy: setFrontLegsPivotY,
          viewBoxMaxX: 260, viewBoxMaxY: 180
        };
      case "backLegs":
        return {
          tx: backLegsTx, setTx: setBackLegsTx,
          ty: backLegsTy, setTy: setBackLegsTy,
          rot: backLegsRot, setRot: setBackLegsRot,
          scale: backLegsScale, setScale: setBackLegsScale,
          px: backLegsPivotX, setPx: setBackLegsPivotX,
          py: backLegsPivotY, setPy: setBackLegsPivotY,
          viewBoxMaxX: 260, viewBoxMaxY: 180
        };
      case "tail":
        return {
          tx: tailTx, setTx: setTailTx,
          ty: tailTy, setTy: setTailTy,
          rot: tailRot, setRot: setTailRot,
          scale: tailScale, setScale: setTailScale,
          px: tailPivotX, setPx: setTailPivotX,
          py: tailPivotY, setPy: setTailPivotY,
          viewBoxMaxX: 160, viewBoxMaxY: 160
        };
    }
  };

  const activePartSvgCode = useMemo(() => {
    return activeTweakPart === "head" ? headSvg : activeTweakPart === "body" ? bodySvg : activeTweakPart === "frontLegs" ? frontLegsSvg : activeTweakPart === "backLegs" ? backLegsSvg : tailSvg;
  }, [activeTweakPart, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg]);

  const shapes = useMemo(() => {
    return activePartSvgCode ? getSvgShapes(activePartSvgCode) : [];
  }, [activePartSvgCode]);

  const activeT = getActiveTransform();

  const handleResetPart = () => {
    if (activeTweakPart === "head") {
      setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
    } else if (activeTweakPart === "body") {
      setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
    } else if (activeTweakPart === "frontLegs") {
      setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
    } else if (activeTweakPart === "backLegs") {
      setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
    } else if (activeTweakPart === "tail") {
      setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
    }
  };

  const renderPartPreview = (partType: "head" | "body" | "frontLegs" | "backLegs" | "tail", svgContent: string) => {
    if (!svgContent.trim()) {
      const dims = partType === "head" || partType === "tail" ? { w: 160, h: 160 } : partType === "body" ? { w: 300, h: 220 } : { w: 260, h: 180 };
      return (
        <g>
          <rect width={dims.w} height={dims.h} fill="none" stroke="#27272a" strokeWidth="2" strokeDasharray="5,5" rx="8" />
          <text x={dims.w / 2} y={dims.h / 2 + 5} fill="#52525b" textAnchor="middle" className="text-[10px] font-mono font-bold uppercase select-none">
            {partType} PLACEHOLDER
          </text>
        </g>
      );
    }
    const partTransforms = shapeAdjustments[partType];
    const highlightIdx = activeTweakPart === partType && activeShapeIndex !== null ? activeShapeIndex : undefined;
    return parseSvgToReact(svgContent, { color, accentColor }, undefined, undefined, partTransforms, highlightIdx);
  };

  // Base translation of body in preview
  const bodyTranslate = { x: 150, y: 150 };

  // Targets relative to body translate + offset
  const neckTarget = {
    x: bodyTranslate.x + neckX + bodyTx,
    y: bodyTranslate.y + neckY + bodyTy
  };
  const tailTarget = {
    x: bodyTranslate.x + tailX + bodyTx,
    y: bodyTranslate.y + tailY + bodyTy
  };
  const frontLegsTarget = {
    x: bodyTranslate.x + frontLegsX + bodyTx,
    y: bodyTranslate.y + frontLegsY + bodyTy
  };
  const backLegsTarget = {
    x: bodyTranslate.x + backLegsX + bodyTx,
    y: bodyTranslate.y + backLegsY + bodyTy
  };

  // Base alignments
  const headLocalNeck = { x: 120, y: 110 };
  const headTranslate = {
    x: neckTarget.x - headLocalNeck.x,
    y: neckTarget.y - headLocalNeck.y
  };

  const tailLocalBody = { x: 15, y: 15 };
  const tailTranslate = {
    x: tailTarget.x - tailLocalBody.x,
    y: tailTarget.y - tailLocalBody.y
  };

  const frontLegsLocalBody = { x: 75, y: 15 };
  const frontLegsTranslate = {
    x: frontLegsTarget.x - frontLegsLocalBody.x,
    y: frontLegsTarget.y - frontLegsLocalBody.y
  };

  const backLegsLocalBody = { x: 195, y: 15 };
  const backLegsTranslate = {
    x: backLegsTarget.x - backLegsLocalBody.x,
    y: backLegsTarget.y - backLegsLocalBody.y
  };

  // Transform strings for groups
  const headTransformStr = `translate(${headTranslate.x + headTx}, ${headTranslate.y + headTy}) translate(${headPivotX}, ${headPivotY}) scale(${headScale}) translate(${-headPivotX}, ${-headPivotY}) rotate(${headRot}, ${headPivotX}, ${headPivotY})`;
  const bodyTransformStr = `translate(${bodyTranslate.x + bodyTx}, ${bodyTranslate.y + bodyTy}) translate(${bodyPivotX}, ${bodyPivotY}) scale(${bodyScale}) translate(${-bodyPivotX}, ${-bodyPivotY}) rotate(${bodyRot}, ${bodyPivotX}, ${bodyPivotY})`;
  const frontLegsTransformStr = `translate(${frontLegsTranslate.x + frontLegsTx}, ${frontLegsTranslate.y + frontLegsTy}) translate(${frontLegsPivotX}, ${frontLegsPivotY}) scale(${frontLegsScale}) translate(${-frontLegsPivotX}, ${-frontLegsPivotY}) rotate(${frontLegsRot}, ${frontLegsPivotX}, ${frontLegsPivotY})`;
  const backLegsTransformStr = `translate(${backLegsTranslate.x + backLegsTx}, ${backLegsTranslate.y + backLegsTy}) translate(${backLegsPivotX}, ${backLegsPivotY}) scale(${backLegsScale}) translate(${-backLegsPivotX}, ${-backLegsPivotY}) rotate(${backLegsRot}, ${backLegsPivotX}, ${backLegsPivotY})`;
  const tailTransformStr = `translate(${tailTranslate.x + tailTx}, ${tailTranslate.y + tailTy}) translate(${tailPivotX}, ${tailPivotY}) scale(${tailScale}) translate(${-tailPivotX}, ${-tailPivotY}) rotate(${tailRot}, ${tailPivotX}, ${tailPivotY})`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl w-full max-w-6xl lg:max-w-7xl max-h-[95vh] overflow-hidden flex flex-col shadow-2xl my-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60 select-none">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-500" size={18} />
            <h2 className="text-sm font-mono font-bold text-zinc-100 uppercase tracking-wider">
              {editingAnimal ? `Modify Animal Template: ${editingAnimal.name}` : "Forge Custom SVG Animal Template"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 bg-zinc-800 rounded-lg hover:bg-zinc-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={validateAndSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Quick Pre-fill Template Trigger */}
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <Info size={16} className="text-amber-500 mt-0.5" />
              <div>
                <p className="text-xs font-mono font-bold text-amber-500 uppercase">Quick Template Loader</p>
                <p className="text-[11px] text-zinc-400">
                  Instantly load a fully-optimized, custom designed hybrid template. Tweak the details, names, colors, or direct SVG code as a safe starting point!
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyTemplate(i)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-[10px] font-mono font-bold transition-all border border-zinc-700"
                >
                  LOAD {tpl.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* AI-driven automatic generator box with Mode Tabs */}
          <div className="p-5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl flex flex-col gap-4 shadow-inner">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-500/10 pb-3 gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-500">
                  <Wand2 size={20} className={isGenerating ? "animate-pulse" : ""} />
                </div>
                <div>
                  <p className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wide flex items-center gap-2">
                    AI Creature Lab <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-normal font-sans tracking-normal capitalize">Powered by Gemini 3.5 Flash</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-normal mt-0.5">
                    {aiMode === "summon" 
                      ? "Describe any creature you can imagine or upload an image to generate SVG parts from scratch."
                      : "Provide instructions or upload a new reference image to iteratively modify the active creature."}
                  </p>
                </div>
              </div>

              {/* Segmented control for Summon vs Refine */}
              {(headSvg || bodySvg) && (
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => setAiMode("summon")}
                    className={`px-3 py-1 text-[10px] font-mono font-bold rounded-md transition-all ${
                      aiMode === "summon"
                        ? "bg-amber-500 text-zinc-950 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    SUMMON NEW
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiMode("refine")}
                    className={`px-3 py-1 text-[10px] font-mono font-bold rounded-md transition-all ${
                      aiMode === "refine"
                        ? "bg-amber-500 text-zinc-950 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    REFINE ACTIVE
                  </button>
                </div>
              )}
            </div>

            {/* Main Interactive Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
              
              {/* Left Column: Optional Visual Reference */}
              <div className="md:col-span-4 flex flex-col justify-between">
                <label className="text-[10px] font-mono text-amber-500/95 uppercase font-bold mb-1.5 block">
                  Optional Visual Inspiration:
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex-1 min-h-[90px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-3 transition-all relative group overflow-hidden ${
                    isDragging
                      ? "border-amber-500 bg-amber-500/10"
                      : uploadedImage
                      ? "border-amber-500/35 bg-zinc-950"
                      : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 hover:bg-zinc-950/80"
                  }`}
                >
                  {uploadedImage ? (
                    <div className="flex items-center gap-3 w-full h-full">
                      <img
                        src={uploadedImage}
                        alt="Inspiration reference"
                        className="w-12 h-12 rounded-lg object-cover border border-amber-500/35 shadow"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono font-bold text-zinc-300 truncate">
                          Inspiration Loaded
                        </p>
                        <p className="text-[9px] font-sans text-zinc-500">
                          AI will be inspired by this image
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadedImage(null)}
                        className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-red-500/20 hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded-lg transition-all active:scale-95 shadow"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full h-full py-1">
                      <Upload size={16} className="text-zinc-500 group-hover:text-amber-500 mb-1 transition-colors" />
                      <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors">
                        Drop image or click to browse
                      </span>
                      <span className="text-[8px] text-zinc-600 mt-0.5">
                        PNG, JPG, WebP up to 5MB
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isGenerating}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Right Column: Text Prompts & Action triggers */}
              <div className="md:col-span-8 flex flex-col justify-end">
                {aiMode === "summon" ? (
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-[10px] font-mono text-amber-500/95 uppercase font-bold block">
                      Summoning Prompt:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={isGenerating}
                        placeholder={
                          uploadedImage
                            ? "Describe how to adapt the image (optional, e.g., 'Make it a metallic dragon')"
                            : "Describe your animal (e.g., 'A mechanical steampunk wolf', 'A cute sapphire owl')"
                        }
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleGenerateWithAI();
                          }
                        }}
                        className="flex-1 text-xs font-mono px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={handleGenerateWithAI}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 hover:shadow-lg disabled:shadow-none text-zinc-950 text-xs font-mono font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 disabled:pointer-events-none"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            GENERATING...
                          </>
                        ) : (
                          <>
                            <Wand2 size={14} />
                            SUMMON CREATURE
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 w-full">
                    {/* Part selector for refinement */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono text-amber-500/90 uppercase font-bold">Target modification:</span>
                      <div className="flex flex-wrap gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800/80">
                        {[
                          { id: "all", label: "Whole Creature" },
                          { id: "head", label: "Head" },
                          { id: "body", label: "Body" },
                          { id: "frontLegs", label: "Front Legs" },
                          { id: "backLegs", label: "Back Legs" },
                          { id: "tail", label: "Tail" }
                        ].map((part) => (
                          <button
                            key={part.id}
                            type="button"
                            onClick={() => setRefinePart(part.id as any)}
                            className={`px-2.5 py-1 text-[10px] font-mono rounded transition-all ${
                              refinePart === part.id
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                            }`}
                          >
                            {part.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="text-[10px] font-mono text-amber-500/95 uppercase font-bold block">
                        Modification Instructions:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={isGenerating}
                          placeholder={
                            refinePart === "all"
                              ? "Instructions (e.g. 'add neon spikes to all parts', 'make its colors cold blues')"
                              : `Instructions for ${refinePart} (e.g. ${
                                  refinePart === "head"
                                    ? "'make ears floppy', 'add monocle'"
                                    : refinePart === "body"
                                    ? "'add massive wings', 'make torso fluffy'"
                                    : refinePart === "frontLegs" || refinePart === "backLegs"
                                    ? "'make them metallic', 'add claws'"
                                    : "'make tail flaming', 'split into 3 strands'"
                                })`
                          }
                          value={refinePrompt}
                          onChange={(e) => setRefinePrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleRefineWithAI();
                            }
                          }}
                          className="flex-1 text-xs font-mono px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                        />
                        <button
                          type="button"
                          disabled={isGenerating}
                          onClick={handleRefineWithAI}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-600 hover:shadow-lg disabled:shadow-none text-zinc-950 text-xs font-mono font-bold rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap active:scale-95 disabled:pointer-events-none"
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              MODIFYING...
                            </>
                          ) : (
                            <>
                              <Wand2 size={14} />
                              APPLY MODIFICATION
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {generationStep && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-amber-500/80 bg-amber-500/5 px-3 py-1.5 rounded-lg border border-amber-500/10">
                {isGenerating && <Loader2 size={10} className="animate-spin text-amber-500" />}
                <span>{generationStep}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* COLUMN 1: Live Interactive Preview & Fine-Tuning Hub */}
            <div className="lg:col-span-4 bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl space-y-4 font-sans">
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                  Studio Live Preview
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    title="Toggle Alignment Grid"
                    onClick={() => setShowPreviewGrid(!showPreviewGrid)}
                    className={`p-1 rounded transition-colors ${showPreviewGrid ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Grid size={13} />
                  </button>
                  <button
                    type="button"
                    title="Toggle Skeleton Joints"
                    onClick={() => setShowPreviewSkeleton(!showPreviewSkeleton)}
                    className={`p-1 rounded transition-colors ${showPreviewSkeleton ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Layers size={13} />
                  </button>
                </div>
              </div>

              {/* Interactive Vector Stage */}
              <div className="relative w-full aspect-square bg-zinc-950 border border-zinc-850 rounded-xl overflow-hidden shadow-inner group">
                <svg
                  viewBox="0 0 600 500"
                  className="w-full h-full select-none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Grid background */}
                  {showPreviewGrid && (
                    <g opacity="0.3">
                      <line x1="0" y1="250" x2="600" y2="250" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,3" />
                      <line x1="300" y1="0" x2="300" y2="500" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,3" />
                      <line x1="0" y1="350" x2="600" y2="350" stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.4" />
                    </g>
                  )}

                  {/* Ground floor shadow */}
                  <ellipse 
                    cx="300" 
                    cy="352" 
                    rx={140 * bodyScale} 
                    ry="8" 
                    fill="#000" 
                    opacity="0.3" 
                    className="blur-sm"
                  />

                  {/* 1. TAIL LAYER (Behind body) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "tail" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("tail")}
                  >
                    <g transform={tailTransformStr}>
                      {renderPartPreview("tail", tailSvg)}
                    </g>
                    {activeTweakPart === "tail" && (
                      <rect
                        x={tailTranslate.x + tailTx - 3}
                        y={tailTranslate.y + tailTy - 3}
                        width={166 * tailScale}
                        height={166 * tailScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}
                  </g>

                  {/* 2. BACK LEGS LAYER (Behind body) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "backLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("backLegs")}
                  >
                    <g transform={backLegsTransformStr}>
                      {renderPartPreview("backLegs", backLegsSvg)}
                    </g>
                    {activeTweakPart === "backLegs" && (
                      <rect
                        x={backLegsTranslate.x + backLegsTx - 3}
                        y={backLegsTranslate.y + backLegsTy - 3}
                        width={266 * backLegsScale}
                        height={186 * backLegsScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}
                  </g>

                  {/* 3. BODY LAYER */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "body" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("body")}
                  >
                    <g transform={bodyTransformStr}>
                      {renderPartPreview("body", bodySvg)}
                    </g>
                    {activeTweakPart === "body" && (
                      <rect
                        x={bodyTranslate.x + bodyTx - 3}
                        y={bodyTranslate.y + bodyTy - 3}
                        width={306 * bodyScale}
                        height={226 * bodyScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}
                  </g>

                  {/* 4. FRONT LEGS LAYER (In front of body) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "frontLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("frontLegs")}
                  >
                    <g transform={frontLegsTransformStr}>
                      {renderPartPreview("frontLegs", frontLegsSvg)}
                    </g>
                    {activeTweakPart === "frontLegs" && (
                      <rect
                        x={frontLegsTranslate.x + frontLegsTx - 3}
                        y={frontLegsTranslate.y + frontLegsTy - 3}
                        width={266 * frontLegsScale}
                        height={186 * frontLegsScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}
                  </g>

                  {/* 5. HEAD LAYER (In front of body) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "head" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("head")}
                  >
                    <g transform={headTransformStr}>
                      {renderPartPreview("head", headSvg)}
                    </g>
                    {activeTweakPart === "head" && (
                      <rect
                        x={headTranslate.x + headTx - 3}
                        y={headTranslate.y + headTy - 3}
                        width={166 * headScale}
                        height={166 * headScale}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="4,4"
                      />
                    )}
                  </g>

                  {/* SKELETON LAYER */}
                  {showPreviewSkeleton && (
                    <g opacity="0.95" pointerEvents="none">
                      {/* Neck link */}
                      <line 
                        x1={neckTarget.x} 
                        y1={neckTarget.y} 
                        x2={headTranslate.x + headTx + headLocalNeck.x} 
                        y2={headTranslate.y + headTy + headLocalNeck.y} 
                        stroke="#ec4899" 
                        strokeWidth="2" 
                        strokeDasharray="2,2" 
                      />
                      <circle cx={neckTarget.x} cy={neckTarget.y} r="5" fill="#ec4899" />
                      <circle cx={headTranslate.x + headTx + headLocalNeck.x} cy={headTranslate.y + headTy + headLocalNeck.y} r="3" fill="#ffffff" />

                      {/* Tail link */}
                      <line 
                        x1={tailTarget.x} 
                        y1={tailTarget.y} 
                        x2={tailTranslate.x + tailTx + tailLocalBody.x} 
                        y2={tailTranslate.y + tailTy + tailLocalBody.y} 
                        stroke="#3b82f6" 
                        strokeWidth="2" 
                        strokeDasharray="2,2" 
                      />
                      <circle cx={tailTarget.x} cy={tailTarget.y} r="5" fill="#3b82f6" />
                      <circle cx={tailTranslate.x + tailTx + tailLocalBody.x} cy={tailTranslate.y + tailTy + tailLocalBody.y} r="3" fill="#ffffff" />

                      {/* Front Legs link */}
                      <line 
                        x1={frontLegsTarget.x} 
                        y1={frontLegsTarget.y} 
                        x2={frontLegsTranslate.x + frontLegsTx + frontLegsLocalBody.x} 
                        y2={frontLegsTranslate.y + frontLegsTy + frontLegsLocalBody.y} 
                        stroke="#eab308" 
                        strokeWidth="2" 
                        strokeDasharray="2,2" 
                      />
                      <circle cx={frontLegsTarget.x} cy={frontLegsTarget.y} r="5" fill="#eab308" />
                      <circle cx={frontLegsTranslate.x + frontLegsTx + frontLegsLocalBody.x} cy={frontLegsTranslate.y + frontLegsTy + frontLegsLocalBody.y} r="3" fill="#ffffff" />

                      {/* Back Legs link */}
                      <line 
                        x1={backLegsTarget.x} 
                        y1={backLegsTarget.y} 
                        x2={backLegsTranslate.x + backLegsTx + backLegsLocalBody.x} 
                        y2={backLegsTranslate.y + backLegsTy + backLegsLocalBody.y} 
                        stroke="#10b981" 
                        strokeWidth="2" 
                        strokeDasharray="2,2" 
                      />
                      <circle cx={backLegsTarget.x} cy={backLegsTarget.y} r="5" fill="#10b981" />
                      <circle cx={backLegsTranslate.x + backLegsTx + backLegsLocalBody.x} cy={backLegsTranslate.y + backLegsTy + backLegsLocalBody.y} r="3" fill="#ffffff" />
                    </g>
                  )}

                  {/* Active Pivot Overlay Crosshair */}
                  {(() => {
                    let px = 0;
                    let py = 0;
                    if (activeTweakPart === "head") {
                      px = headTranslate.x + headTx + headPivotX;
                      py = headTranslate.y + headTy + headPivotY;
                    } else if (activeTweakPart === "body") {
                      px = bodyTranslate.x + bodyTx + bodyPivotX;
                      py = bodyTranslate.y + bodyTy + bodyPivotY;
                    } else if (activeTweakPart === "frontLegs") {
                      px = frontLegsTranslate.x + frontLegsTx + frontLegsPivotX;
                      py = frontLegsTranslate.y + frontLegsTy + frontLegsPivotY;
                    } else if (activeTweakPart === "backLegs") {
                      px = backLegsTranslate.x + backLegsTx + backLegsPivotX;
                      py = backLegsTranslate.y + backLegsTy + backLegsPivotY;
                    } else if (activeTweakPart === "tail") {
                      px = tailTranslate.x + tailTx + tailPivotX;
                      py = tailTranslate.y + tailTy + tailPivotY;
                    }

                    return (
                      <g>
                        <circle cx={px} cy={py} r="10" fill="none" stroke="#f59e0b" strokeWidth="1.5" className="animate-pulse" />
                        <circle cx={px} cy={py} r="4" fill="#f59e0b" stroke="#18181b" strokeWidth="1" />
                        <line x1={px - 14} y1={py} x2={px + 14} y2={py} stroke="#f59e0b" strokeWidth="1.2" />
                        <line x1={px} y1={py - 14} x2={px} y2={py + 14} stroke="#f59e0b" strokeWidth="1.2" />
                        <text x={px + 12} y={py - 6} fill="#f59e0b" className="text-[9px] font-mono font-bold bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 shadow-lg">
                          {activeTweakPart.toUpperCase()} PIVOT
                        </text>
                      </g>
                    );
                  })()}
                </svg>

                <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-md px-2 py-1 rounded text-[9px] font-mono text-zinc-400 border border-zinc-800 shadow-md">
                  Click on parts inside preview to switch focus
                </div>
              </div>

              {/* Part Selector Buttons */}
              <div className="space-y-1.5 font-mono">
                <span className="text-[9px] text-zinc-500 uppercase block tracking-wider font-mono">
                  Active Part to Fine-Tune:
                </span>
                <div className="grid grid-cols-5 gap-1 font-mono">
                  {(["head", "body", "frontLegs", "backLegs", "tail"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setActiveTweakPart(p)}
                      className={`py-1.5 px-0.5 rounded-lg text-[9px] font-bold border transition-all text-center uppercase ${
                        activeTweakPart === p
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-md"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200"
                      }`}
                    >
                      {p === "frontLegs" ? "F-Legs" : p === "backLegs" ? "B-Legs" : p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Adjustments Panel */}
              <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-900 space-y-3 font-mono">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-900">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1">
                    <SlidersHorizontal size={10} />
                    {activeTweakPart} Transform
                  </span>
                  <button
                    type="button"
                    onClick={handleResetPart}
                    className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw size={8} /> RESET
                  </button>
                </div>

                <div className="space-y-2.5">
                  {/* Translate X */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Translate X</span>
                      <span className="text-amber-500 font-bold">{activeT.tx}px</span>
                    </div>
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={activeT.tx}
                      onChange={(e) => activeT.setTx(parseInt(e.target.value) || 0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Translate Y */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Translate Y</span>
                      <span className="text-amber-500 font-bold">{activeT.ty}px</span>
                    </div>
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={activeT.ty}
                      onChange={(e) => activeT.setTy(parseInt(e.target.value) || 0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Rotate */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Rotate Angle</span>
                      <span className="text-amber-500 font-bold">{activeT.rot}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={activeT.rot}
                      onChange={(e) => activeT.setRot(parseInt(e.target.value) || 0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Scale */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Scale Factor</span>
                      <span className="text-amber-500 font-bold">x{activeT.scale.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="2.5"
                      step="0.05"
                      value={activeT.scale}
                      onChange={(e) => activeT.setScale(parseFloat(e.target.value) || 1.0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Pivot X */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Rotation Pivot X</span>
                      <span className="text-amber-500 font-bold">{activeT.px}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={activeT.viewBoxMaxX}
                      step="1"
                      value={activeT.px}
                      onChange={(e) => activeT.setPx(parseInt(e.target.value) || 0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Pivot Y */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-zinc-400">Rotation Pivot Y</span>
                      <span className="text-amber-500 font-bold">{activeT.py}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={activeT.viewBoxMaxY}
                      step="1"
                      value={activeT.py}
                      onChange={(e) => activeT.setPy(parseInt(e.target.value) || 0)}
                      className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* SUB-SHAPE ADJUSTER INTEGRATION */}
                <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">
                      <SlidersHorizontal size={12} />
                      Sub-Shape Adjuster ({activeTweakPart})
                    </div>
                    {activeShapeIndex !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setShapeAdjustments(prev => {
                            const partAdjustments = { ...prev[activeTweakPart] };
                            delete partAdjustments[activeShapeIndex];
                            return { ...prev, [activeTweakPart]: partAdjustments };
                          });
                          setActiveShapeIndex(null);
                        }}
                        className="text-[9px] font-mono font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                      >
                        RESET SHAPE
                      </button>
                    )}
                  </div>

                  {shapes.length === 0 ? (
                    <div className="text-[10px] text-zinc-500 font-mono italic p-3 bg-zinc-950/40 rounded-lg border border-zinc-900/60 text-center">
                      No vector shapes detected for {activeTweakPart}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Shape Selector Dropdown */}
                      <div className="space-y-1">
                        <label className="text-[9px] text-zinc-400 font-mono block">Select Shape Layer</label>
                        <select
                          value={activeShapeIndex !== null ? activeShapeIndex : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setActiveShapeIndex(val === "" ? null : parseInt(val));
                          }}
                          className="w-full text-xs font-mono px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-md text-zinc-300 focus:outline-none focus:border-amber-500"
                        >
                          <option value="">-- Choose a shape path --</option>
                          {shapes.map((s, i) => (
                            <option key={i} value={i}>
                              [{i}] {s.tagName.toUpperCase()} ({s.id || s.fill || "no fill"})
                            </option>
                          ))}
                        </select>
                      </div>

                      {activeShapeIndex !== null && (
                        <div className="space-y-2.5 p-2.5 bg-zinc-950/50 rounded-lg border border-zinc-900/60 animate-fade-in">
                          {/* Sub-shape transform inputs */}
                          {(() => {
                            const currentTransform: ShapeTransform = shapeAdjustments[activeTweakPart][activeShapeIndex] || {
                              translateX: 0,
                              translateY: 0,
                              scale: 1,
                              rotate: 0,
                            };

                            const updateTransform = (fields: Partial<ShapeTransform>) => {
                              setShapeAdjustments(prev => {
                                const partAdjustments = { ...prev[activeTweakPart] };
                                partAdjustments[activeShapeIndex] = {
                                  ...currentTransform,
                                  ...fields,
                                };
                                return { ...prev, [activeTweakPart]: partAdjustments };
                              });
                            };

                            return (
                              <div className="space-y-2.5 font-mono">
                                {/* Translate X */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-zinc-400">Shape Move X</span>
                                    <span className="text-amber-500 font-bold">{currentTransform.translateX || 0}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={currentTransform.translateX || 0}
                                    onChange={(e) => updateTransform({ translateX: parseInt(e.target.value) || 0 })}
                                    className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Translate Y */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-zinc-400">Shape Move Y</span>
                                    <span className="text-amber-500 font-bold">{currentTransform.translateY || 0}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={currentTransform.translateY || 0}
                                    onChange={(e) => updateTransform({ translateY: parseInt(e.target.value) || 0 })}
                                    className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Rotate */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-zinc-400">Shape Rotate</span>
                                    <span className="text-amber-500 font-bold">{currentTransform.rotate || 0}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    step="1"
                                    value={currentTransform.rotate || 0}
                                    onChange={(e) => updateTransform({ rotate: parseInt(e.target.value) || 0 })}
                                    className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Scale */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[9px]">
                                    <span className="text-zinc-400">Shape Scale</span>
                                    <span className="text-amber-500 font-bold">x{(currentTransform.scale !== undefined ? currentTransform.scale : 1).toFixed(2)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0.2"
                                    max="3"
                                    step="0.05"
                                    value={currentTransform.scale !== undefined ? currentTransform.scale : 1}
                                    onChange={(e) => updateTransform({ scale: parseFloat(e.target.value) || 1.0 })}
                                    className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Fill Color override */}
                                <div className="space-y-1 pt-1">
                                  <span className="text-[9px] text-zinc-400 block mb-1">Color Override</span>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="color"
                                      value={currentTransform.fill || "#ffffff"}
                                      onChange={(e) => updateTransform({ fill: e.target.value })}
                                      className="w-7 h-7 bg-transparent border border-zinc-800 rounded cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      placeholder="HEX code or empty"
                                      value={currentTransform.fill || ""}
                                      onChange={(e) => updateTransform({ fill: e.target.value || undefined })}
                                      className="flex-1 text-[11px] font-mono px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 focus:outline-none focus:border-amber-500"
                                    />
                                    {currentTransform.fill && (
                                      <button
                                        type="button"
                                        onClick={() => updateTransform({ fill: undefined })}
                                        className="text-[9px] px-1.5 py-1 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* COLUMN 2: Basic Info & Joints */}
            <div className="lg:col-span-4 space-y-4 font-sans">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                  Animal Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Phoenix, Triceratops, Griffin"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                    Base Color (Primary)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="flex-1 text-xs font-mono px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-300"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                    Accent Color
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 text-xs font-mono px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-zinc-300"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                  Short Description
                </label>
                <textarea
                  placeholder="Tell us about this species..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full text-xs px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              {/* Body joints adjustment offsets */}
              <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-900 space-y-3 font-sans">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-mono">
                  Body Joint Connection Hub (X, Y pivots)
                </span>
                <p className="text-[10px] text-zinc-500 leading-tight font-sans">
                  Pre-calibrate where other species' heads, legs, or tails hook onto this custom body.
                </p>

                <div className="grid grid-cols-2 gap-4 font-mono">
                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 block font-bold">Neck Pivot (Head connection)</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={neckX}
                        onChange={(e) => setNeckX(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={neckY}
                        onChange={(e) => setNeckY(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="Y"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 block font-bold">Tail Pivot (Tail connection)</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={tailX}
                        onChange={(e) => setTailX(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={tailY}
                        onChange={(e) => setTailY(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="Y"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 block font-bold">Front Legs Pivot</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={frontLegsX}
                        onChange={(e) => setFrontLegsX(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={frontLegsY}
                        onChange={(e) => setFrontLegsY(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="Y"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] text-zinc-400 block font-bold">Back Legs Pivot</span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        value={backLegsX}
                        onChange={(e) => setBackLegsX(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={backLegsY}
                        onChange={(e) => setBackLegsY(parseInt(e.target.value) || 0)}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="Y"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 3: SVG Code Editors */}
            <div className="lg:col-span-4 space-y-4 font-sans">
              <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                  SVG Part Vectors (Pure SVGs)
                </span>
                <span className="text-[9px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                  Use "primary" or "accent"
                </span>
              </div>

              <div className="space-y-3 text-xs font-mono">
                {/* HEAD */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>HEAD COMPONENT (Ideal grid: 160x160)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={headSvg}
                    onChange={(e) => setHeadSvg(e.target.value)}
                    placeholder="e.g. <path d='...' fill='primary' />"
                    className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                  />
                </div>

                {/* BODY */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>BODY COMPONENT (Ideal grid: 300x220)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={bodySvg}
                    onChange={(e) => setBodySvg(e.target.value)}
                    placeholder="e.g. <ellipse cx='150' cy='110' rx='100' ry='50' fill='primary' />"
                    className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                  />
                </div>

                {/* FRONT LEGS */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>FRONT LEGS COMPONENT (Ideal grid: 260x180)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={frontLegsSvg}
                    onChange={(e) => setFrontLegsSvg(e.target.value)}
                    placeholder="e.g. <path d='...' fill='primary' />"
                    className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                  />
                </div>

                {/* BACK LEGS */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>BACK LEGS COMPONENT (Ideal grid: 260x180)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={backLegsSvg}
                    onChange={(e) => setBackLegsSvg(e.target.value)}
                    placeholder="e.g. <path d='...' fill='primary' />"
                    className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                  />
                </div>

                {/* TAIL */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>TAIL COMPONENT (Ideal grid: 160x160)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={tailSvg}
                    onChange={(e) => setTailSvg(e.target.value)}
                    placeholder="e.g. <path d='...' fill='accent' />"
                    className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                  />
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <p className="text-red-500 text-xs font-mono text-center p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              {errorMsg}
            </p>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-bold rounded-lg transition-colors border border-zinc-850"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-mono font-bold rounded-lg transition-all shadow-md active:scale-95"
            >
              FORGE ANIMAL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
