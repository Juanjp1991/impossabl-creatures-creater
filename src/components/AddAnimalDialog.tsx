import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Sparkles, HelpCircle, Info, FileText, Wand2, Loader2, Compass, Move, RotateCw, Settings, Grid, SlidersHorizontal, RefreshCw, Layers, Upload, Image, Trash2, Undo2, Redo2, FlipHorizontal, FlipVertical, Copy, GitBranch, Spline, Palette, ShieldAlert, ZoomIn, ZoomOut, Bookmark, Library, Crop } from "lucide-react";
import { Animal, type AnimalPartType } from "../types";
import { parseSvgToReact, getSvgShapes, ShapeTransform } from "../utils/svgParser";
import { applyPreset, createDefaultBrief, GENERATION_PRESETS, summarizeBrief } from "../generation/brief";
import { detailDensityProfile, detailDensityTotal } from "../generation/detailDensity";
import { populateGuidedBrief } from "../generation/clientPipeline";
import { PART_TYPES } from "../generation/contracts";
import type { AnatomyStylePlan, AnimalDraft, BlueprintConnectionProfile, GenerationMetadata, GuidedAnimalBrief, ReferenceMode, ValidationIssue } from "../generation/contracts";
import { buildAssembledPreviewSvg, splitSvgDepthLayers } from "../generation/preview";
import { validateAnimalDraft } from "../generation/validation";
import { normalizeGeneratedSvgSyntax } from "../generation/normalize";
import { errorSignature, newErrorsSince } from "../editor/validationGate";
import { DEFAULT_SAMPLE_CONCURRENCY, DEFAULT_SAMPLE_COUNT, runSampleGeneration, type GeneratedSample, type SampleProvenance } from "../generation/sampleSelection";
import { runPartPipeline } from "../generation/partPipeline";
import { buildExemplarBlock } from "../generation/exemplars";
import { DEFAULT_VARIATION_CONCURRENCY, DEFAULT_VARIATION_COUNT, VARIATION_STRENGTHS, runPartVariations, type VariationStrength } from "../generation/partVariations";
import { SVG_FIELD as PART_SVG_FIELD } from "../partBank/contracts";
import { fetchModels, type ModelOption } from "../generation/apiClient";
import { downscaleReferenceFile } from "../referenceImage/downscale";
import { cropReferenceDataUrl, isMeaningfulCrop, type NormalizedCrop, type ReferenceCrops } from "../referenceImage/crop";
import { scoreKey, scoreRound } from "../referenceImage/scoreRound";
import type { ConformanceScore } from "../generation/conformance";
import { ReferenceCropper } from "./ReferenceCropper";
import { ReferenceIndicator } from "./ReferenceIndicator";
import { deleteReferenceImage, getReferenceImage, putReferenceImage, type ReferenceImageInput } from "../referenceImage/store";
import { ContactSheetSelector } from "./ContactSheetSelector";
import { PartBankPanel } from "./PartBankPanel";
import { PartBankComposer } from "./PartBankComposer";
import { SlotCandidatePicker } from "./SlotCandidatePicker";
import { namespaceEntry, type PartBankEntry } from "../partBank/contracts";
import { usePartBank } from "../partBank/usePartBank";
import { SvgLayersPanel } from "./SvgLayersPanel";
import { RigEditorPanel } from "./RigEditorPanel";
import { densityAfterDuplication, deleteSvgLayer, duplicateSvgLayer, extendChain, isProtectedLayer, ensureStableSvgLayerIds, getSvgLayerTransform, getSvgLayerTree, moveSvgLayer, renameSvgLayer, resetSvgLayerTransform, setSvgLayerLocked, setSvgLayerTransform, setSvgLayerVisibility, type LayerMove } from "../editor/svgLayers";
import { createGizmoDragHandler } from "../editor/useGizmo";
import { toSvgTransform, type GizmoBounds, type PartTransform } from "../editor/transform";

/**
 * Mirror and stretch only. Deliberately narrower than `PartTransform`: these values are
 * spread over the transform built from the sliders, so if the record could also carry
 * translate/rotate/scale it would silently reset them back to their defaults.
 */
type PartExtras = Pick<PartTransform, "flipX" | "flipY" | "scaleX" | "scaleY">;
import { rectToStageBounds } from "../editor/partAdjustment";
import { applyMarquee, idsInside, toggleSelection, isMarqueeMeaningful, marqueeFromPoints, unionBounds, type MarqueeCandidate } from "../editor/marquee";
import { bendPartSvg } from "../editor/deform";
import { hasBend, type SpinePoint } from "../editor/pathWarp";
import { PATTERN_KINDS, type PatternKind } from "../editor/patterns";
import { applyPatternToShape, removePatternFromShape, setShapeToken } from "../editor/patternsDom";
import { RAMP_TOKENS, resolveRamp, type RampToken } from "../generation/palette";
import { VIEW } from "../generation/geometry";
import { sanitizeForSave } from "../editor/sanitize";
import { GizmoOverlay } from "./GizmoOverlay";
import { PartPreview } from "./PartPreview";
import { BendHandles } from "./BendHandles";
import { AnchorHandles } from "./AnchorHandles";
import { resolveAnchorDrag, type AnchorPart } from "../editor/anchors";
import type { RigDefinition } from "../rig/contracts";
import { computeForwardKinematics, computeLocalJointMatrices, rigMatrixToSvg } from "../rig/engine";

type EditablePart = "head" | "body" | "frontLegs" | "backLegs" | "tail";

/** Reads naturally inside the progress line, unlike the capitalised control labels. */
const VARIATION_STRENGTH_WORD: Record<VariationStrength, string> = { tight: "tight", moderate: "related", loose: "loose" };
const EMPTY_HISTORY = (): Record<EditablePart, string[]> => ({ head: [], body: [], frontLegs: [], backLegs: [], tail: [] });

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

// Minimal plan used only to shape a metadata record when a sampled composition has no
// usable per-sample plan. Never used to gate: validation runs against the real plan.
const FALLBACK_PLAN: AnatomyStylePlan = {
  speciesFeatures: [],
  anatomyTemplate: "quadruped-five-part",
  requiredParts: ["head", "body", "frontLegs", "backLegs", "tail"],
  proportionsAndSilhouette: "",
  pose: "",
  orientation: "left-facing",
  paletteAndMarkings: "",
  layerPlan: [],
  attachmentStrategy: [],
  requiredNamedGroups: { head: ["head-root"], body: ["body-root"], frontLegs: ["frontLegs-root"], backLegs: ["backLegs-root"], tail: ["tail-root"] },
  suggestedJoints: [],
};

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
  const [shapeAdjustments, setShapeAdjustments] = useState<Record<EditablePart, Record<string, ShapeTransform>>>({
    head: {},
    body: {},
    frontLegs: {},
    backLegs: {},
    tail: {},
  });
  const [activeShapeIndex, setActiveShapeIndex] = useState<string | null>(null);
  /**
   * Every selected shape. `activeShapeIndex` stays the primary one, so the panels that
   * describe a single layer (rename, pattern, transform readouts) keep working unchanged
   * while move, duplicate and delete act on the whole set.
   */
  const [selection, setSelection] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<GizmoBounds | null>(null);
  /**
   * Stage viewport, as the SVG viewBox.
   *
   * Zooming by viewBox rather than by CSS-transforming a wrapper is what keeps every gizmo
   * working untouched: getScreenCTM() already accounts for the viewBox, so screen-to-local
   * conversion stays correct at any zoom without a single change to the drag maths.
   */
  const [view, setView] = useState({ x: 0, y: 0, w: 600, h: 500 });
  const [svgUndo, setSvgUndo] = useState<Record<EditablePart, string[]>>(EMPTY_HISTORY);
  const [svgRedo, setSvgRedo] = useState<Record<EditablePart, string[]>>(EMPTY_HISTORY);
  /**
   * Off by default: scaling an individual shape about the *part's* attachment anchor is
   * geometrically valid but a poor default. The anchor is usually far from a small detail,
   * so scaling about it flings the shape across the canvas, and when the anchor happens to
   * sit a few units away on one axis the scale factor swings wildly for a tiny drag. A
   * sub-shape scales about its own bounding box; the anchor mode stays available for the
   * cases where welding a whole limb layer to the joint is what you want.
   */
  const [keepLayerAnchorFixed, setKeepLayerAnchorFixed] = useState(false);
  const [proportionalLayerScaling, setProportionalLayerScaling] = useState(true);
  const previewStageRef = useRef<SVGSVGElement>(null);
  const [selectedLayerBounds, setSelectedLayerBounds] = useState<{ x: number; y: number; width: number; height: number; transform: string } | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<AnchorPart | null>(null);
  /**
   * Mirror and per-axis stretch per part. Held as one record rather than four more useState
   * pairs per part, which would add twenty hooks to a component that already has thirty.
   */
  const [partExtras, setPartExtras] = useState<Record<EditablePart, PartExtras>>({
    head: {}, body: {}, frontLegs: {}, backLegs: {}, tail: {},
  });
  const [partStretchMode, setPartStretchMode] = useState(false);
  /**
   * Live spine bend for the active part. Held apart from the part SVG so the sliders stay
   * scrubbable — baking on every change would push fifty entries onto the undo stack and
   * compound rounding. Committed once, on Apply.
   */
  const [bend, setBend] = useState<{ points: SpinePoint[]; axis: "x" | "y" }>({
    points: [{ t: 0, offset: 0 }, { t: 0.5, offset: 0 }, { t: 1, offset: 0 }],
    axis: "x",
  });
  const [bendSelection, setBendSelection] = useState<number | null>(null);
  const [pattern, setPattern] = useState<{ kind: PatternKind; scale: number; density: number; token: RampToken }>({
    kind: "spots", scale: 1, density: 0.5, token: "primary-dark",
  });
  const [patternNote, setPatternNote] = useState("");
  /** On-canvas spine handles. Off by default so the stage stays uncluttered. */
  const [bendMode, setBendMode] = useState(false);
  const [liveIssues, setLiveIssues] = useState<ValidationIssue[]>([]);
  const [saveBlocked, setSaveBlocked] = useState<ValidationIssue[]>([]);
  /**
   * Error signatures the part already had when the dialog opened.
   *
   * The two legacy built-ins fail the modern standard badly — the Grizzly Bear alone opens
   * with 16 errors from gradients and missing root groups. Blocking on those would make the
   * editor useless for exactly the parts that most need repairing, so the gate is "your edit
   * must not make it worse" rather than "the part must be perfect".
   */
  const baselineErrors = useRef<Map<string, number>>(new Map());
  const [rigDefinition, setRigDefinition] = useState<RigDefinition | undefined>();
  const [rigPoseRotations, setRigPoseRotations] = useState<Record<string, number>>({});

  const [errorMsg, setErrorMsg] = useState("");

  // AI Generation State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAutoFillingBrief, setIsAutoFillingBrief] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  // §R1 reference image. `uploadedImage` is the downscaled data URL every AI call and the
  // preview `<img>` consume; `referenceRecord` carries the JPEG bytes behind it so a save can
  // write them to IndexedDB without re-encoding. Both are null when no reference is active.
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [referenceRecord, setReferenceRecord] = useState<ReferenceImageInput | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  // §R3 per-slot crops of that reference, and which row's cropper is open.
  const [referenceCrops, setReferenceCrops] = useState<ReferenceCrops>({});
  const [cropSlot, setCropSlot] = useState<EditablePart | null>(null);
  // §S1 conformance scores for whatever round is on screen, keyed `${slot}:${sampleIndex}`.
  const [conformance, setConformance] = useState<Map<string, ConformanceScore>>(new Map());
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("match");
  const [isDragging, setIsDragging] = useState(false);
  const [guidedBrief, setGuidedBrief] = useState<GuidedAnimalBrief>(() => createDefaultBrief());
  const selectedDetailDensity = detailDensityProfile(guidedBrief.detailLevel);
  const selectedDetailTotal = detailDensityTotal(guidedBrief.detailLevel);
  const [generationMetadata, setGenerationMetadata] = useState<GenerationMetadata | undefined>();
  const [pipelinePreviews, setPipelinePreviews] = useState<{ cleanSvg: string; diagnosticSvg: string } | null>(null);
  // §5.3 parallel-sample-and-select state. When `samples` is set the contact sheet is shown.
  const [samples, setSamples] = useState<GeneratedSample[] | null>(null);
  const [sampleCount, setSampleCount] = useState(DEFAULT_SAMPLE_COUNT);
  const [sampleProgress, setSampleProgress] = useState<{ done: number; total: number } | null>(null);
  // §5.5 part bank. `bankSlot` is the SVG editor row whose browser is open; `slotRegen`
  // holds a single-slot re-roll awaiting a pick; `showComposer` swaps the AI panel for the
  // build-from-bank flow.
  const { savePart: savePartToBank, entries: bankEntries, error: bankError, setError: setBankError } = usePartBank();
  const [bankSlot, setBankSlot] = useState<EditablePart | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [slotRegen, setSlotRegen] = useState<{ slot: EditablePart; samples: GeneratedSample[]; heading?: string } | null>(null);
  const [regeneratingSlot, setRegeneratingSlot] = useState<EditablePart | null>(null);
  const [bankNotice, setBankNotice] = useState("");
  // §5.6 "more like this": variations seeded with a part you already chose, rather than
  // fresh draws. Held here rather than in the picker so a round can be re-run from any
  // candidate without the settings resetting between rounds.
  const [variationStrength, setVariationStrength] = useState<VariationStrength>("moderate");
  const [variationInstructions, setVariationInstructions] = useState("");
  const [variationCount, setVariationCount] = useState(DEFAULT_VARIATION_COUNT);
  const [varyingSlot, setVaryingSlot] = useState<EditablePart | null>(null);
  // §7 in-app model selector — the chosen model threads through every AI call.
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelId, setModelId] = useState<string>("");
  // §P3: extra models to round-robin across a contact sheet. Empty means "just `modelId`",
  // which is today's behaviour; every non-sheet call still uses `modelId` alone.
  const [sheetModelIds, setSheetModelIds] = useState<string[]>([]);
  const displayedValidation = generationMetadata
    ? generationMetadata.validationHistory[generationMetadata.bestAttempt ?? generationMetadata.validationHistory.length - 1] ?? generationMetadata.validationHistory.at(-1)
    : undefined;
  const displayedReview = generationMetadata
    ? [...(generationMetadata.attemptHistory ?? [])].reverse().find((attempt) => attempt.accepted && attempt.attempt <= (generationMetadata.bestAttempt ?? Number.MAX_SAFE_INTEGER) && attempt.review)?.review
      ?? generationMetadata.reviewHistory[0]
      ?? generationMetadata.reviewHistory.at(-1)
    : undefined;

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image size should be less than 5MB.");
      return;
    }
    // Downscale on the way in, so the full-size upload never reaches state, storage or the
    // wire. Every later consumer sees the ~512px version.
    setReferenceLoading(true);
    try {
      const resized = await downscaleReferenceFile(file);
      setUploadedImage(resized.dataUrl);
      setReferenceRecord({ blob: resized.blob, width: resized.width, height: resized.height });
      // A new photo invalidates every crop drawn against the old one.
      setReferenceCrops({});
      setCropSlot(null);
      setErrorMsg("");
    } catch (error: any) {
      setErrorMsg(error?.message || "Failed to read the image file.");
    } finally {
      setReferenceLoading(false);
    }
  };

  const clearReferenceImage = () => {
    setUploadedImage(null);
    setReferenceRecord(null);
    // Crops are coordinates into a specific image; they mean nothing once it is gone.
    setReferenceCrops({});
    setCropSlot(null);
  };

  /**
   * §R3: the image a part-targeted call should actually receive. With a crop set for that
   * slot the model gets only that region, which is a far stronger region hint than asking it
   * to find the part inside a whole-animal photo. Falls back to the full reference if the
   * crop cannot be rendered, since a weaker hint beats a failed round.
   */
  const referenceForPart = async (slot: EditablePart): Promise<string | null> => {
    if (!uploadedImage) return null;
    const crop = referenceCrops[slot];
    if (!isMeaningfulCrop(crop)) return uploadedImage;
    try {
      return await cropReferenceDataUrl(uploadedImage, crop);
    } catch (error) {
      console.warn("Could not crop the reference image; sending the whole reference:", error);
      return uploadedImage;
    }
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

  const updateBriefField = <K extends keyof GuidedAnimalBrief>(key: K, value: GuidedAnimalBrief[K]) => {
    setGuidedBrief((current) => {
      const next = { ...current, [key]: value };
      return key === "summary" ? next : { ...next, summary: summarizeBrief(next) };
    });
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
      setSvgUndo(EMPTY_HISTORY());
      setSvgRedo(EMPTY_HISTORY());
      setSamples(null);
      setSampleProgress(null);
      if (editingAnimal) {
        setName(editingAnimal.name);
        setColor(editingAnimal.color);
        setAccentColor(editingAnimal.accentColor);
        setDescription(editingAnimal.description);
        setGenerationMetadata(editingAnimal.generationMetadata);
        setReferenceMode(editingAnimal.generationMetadata?.referenceMode ?? "match");
        setGuidedBrief(editingAnimal.generationMetadata?.brief ?? createDefaultBrief(editingAnimal.name));
        setPipelinePreviews(null);
        setRigDefinition(editingAnimal.rig);
        setRigPoseRotations(editingAnimal.rig?.bindPose ?? {});
        
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
        selectShapes([]);
        setActiveTweakPart("head");
        setErrorMsg("");
      } else {
        // Reset to initial empty state
        setName("");
        setColor("#3B82F6");
        setAccentColor("#F59E0B");
        setDescription("");
        setGenerationMetadata(undefined);
        setGuidedBrief(createDefaultBrief());
        setPipelinePreviews(null);
        setRigDefinition(undefined);
        setRigPoseRotations({});
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
        selectShapes([]);
        setActiveTweakPart("head");
        setErrorMsg("");
      }
    }
  }, [isOpen, editingAnimal]);

  /**
   * §R1: rehydrate the reference image from IndexedDB when the dialog opens.
   *
   * `uploadedImage` used to be dialog-local state that died with the unmount, so re-opening a
   * saved animal to refine its legs ran with no reference while the mode still read "close
   * match". This is the read half of that fix; the write half is in `validateAndSubmit`. The
   * store is async, hence the loading flag rather than a synchronous initializer.
   */
  useEffect(() => {
    if (!isOpen) return;
    clearReferenceImage();
    const animalId = editingAnimal?.id;
    if (!animalId) return;
    let cancelled = false;
    setReferenceLoading(true);
    getReferenceImage(animalId)
      .then((stored) => {
        if (cancelled || !stored) return;
        setUploadedImage(stored.dataUrl);
        setReferenceRecord({ blob: stored.blob, width: stored.width, height: stored.height, crops: stored.crops });
        setReferenceCrops(stored.crops);
      })
      .catch((error) => console.warn("Could not load the stored reference image:", error))
      .finally(() => { if (!cancelled) setReferenceLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, editingAnimal?.id]);

  /**
   * §S1: score whichever round is on screen against the cropped reference. Runs on the
   * contact sheet (every slot that has a crop) and on a single-slot re-roll or vary round
   * (that slot only). Slots without a crop produce no score and the UI simply omits the chip.
   */
  useEffect(() => {
    const round = slotRegen
      ? { slots: [slotRegen.slot] as EditablePart[], samples: slotRegen.samples }
      : samples
      ? { slots: PART_TYPES as EditablePart[], samples }
      : null;
    if (!round || !uploadedImage) {
      setConformance(new Map());
      return;
    }
    let cancelled = false;
    scoreRound({ image: uploadedImage, crops: referenceCrops, slots: round.slots, samples: round.samples })
      .then((scores) => { if (!cancelled) setConformance(scores); })
      .catch((error) => console.warn("Conformance scoring failed:", error));
    return () => { cancelled = true; };
  }, [samples, slotRegen, referenceCrops, uploadedImage]);

  /** The primary model always leads, so a sheet with no extras behaves exactly as before. */
  const sampleModelIds = [modelId, ...sheetModelIds.filter((id) => id && id !== modelId)];

  // A model that cannot read images fails the whole call rather than ignoring the reference,
  // so this has to be visible before the button is pressed, not after a 400 comes back.
  const blindWithReference = Boolean(uploadedImage) && models.some((model) => model.id === modelId && model.vision === false);

  const conformanceOf = (slot: EditablePart, sampleIndex: number) => conformance.get(scoreKey(slot, sampleIndex))?.score;

  /**
   * §S2 silhouette underlay: the cropped reference as a data URL per slot, rendered ghosted
   * behind candidate previews. Cut once per crop change rather than per candidate.
   */
  const [slotUnderlays, setSlotUnderlays] = useState<Partial<Record<EditablePart, string>>>({});
  useEffect(() => {
    let cancelled = false;
    if (!uploadedImage) { setSlotUnderlays({}); return; }
    (async () => {
      const next: Partial<Record<EditablePart, string>> = {};
      for (const slot of PART_TYPES as EditablePart[]) {
        const crop = referenceCrops[slot];
        if (!isMeaningfulCrop(crop)) continue;
        try {
          next[slot] = await cropReferenceDataUrl(uploadedImage, crop);
        } catch (error) {
          console.warn(`Could not render the ${slot} underlay:`, error);
        }
      }
      if (!cancelled) setSlotUnderlays(next);
    })();
    return () => { cancelled = true; };
  }, [uploadedImage, referenceCrops]);

  // Load the available models once the dialog opens; keep any prior explicit choice.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchModels().then((result) => {
      if (cancelled) return;
      setModels(result.models);
      setModelId((current) => (current && result.models.some((model) => model.id === current)) ? current : result.defaultModelId);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Keep the pipeline previews synchronized with palette, connection and SVG
  // edits. This also re-colourizes older generated drafts that used CSS
  // variable placeholders before the preview renderer supported them.
  useEffect(() => {
    if (!generationMetadata || !headSvg.trim() || !bodySvg.trim() || !frontLegsSvg.trim() || !backLegsSvg.trim() || !tailSvg.trim()) return;
    const draft: AnimalDraft = {
      name: name || "Generated creature",
      color,
      accentColor,
      description: description || name || "Generated creature",
      bodyConnections: {
        neck: { x: neckX, y: neckY }, tail: { x: tailX, y: tailY },
        frontLegs: { x: frontLegsX, y: frontLegsY }, backLegs: { x: backLegsX, y: backLegsY },
      },
      headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg,
      layoutMetadata: generationMetadata.generatedLayout,
    };
    setPipelinePreviews({ cleanSvg: buildAssembledPreviewSvg(draft), diagnosticSvg: buildAssembledPreviewSvg(draft, true) });
  }, [generationMetadata, name, color, accentColor, description, neckX, neckY, tailX, tailY, frontLegsX, frontLegsY, backLegsX, backLegsY, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg]);

  const applyAnimalDraft = (data: AnimalDraft) => {
    setName(data.name || ""); setColor(data.color || "#cccccc"); setAccentColor(data.accentColor || "#ffaa00"); setDescription(data.description || "");
    setNeckX(data.bodyConnections?.neck?.x ?? 75); setNeckY(data.bodyConnections?.neck?.y ?? 90);
    setTailX(data.bodyConnections?.tail?.x ?? 260); setTailY(data.bodyConnections?.tail?.y ?? 105);
    setFrontLegsX(data.bodyConnections?.frontLegs?.x ?? 115); setFrontLegsY(data.bodyConnections?.frontLegs?.y ?? 160);
    setBackLegsX(data.bodyConnections?.backLegs?.x ?? 235); setBackLegsY(data.bodyConnections?.backLegs?.y ?? 160);
    setHeadSvg(data.headSvg || ""); setBodySvg(data.bodySvg || ""); setFrontLegsSvg(data.frontLegsSvg || ""); setBackLegsSvg(data.backLegsSvg || ""); setTailSvg(data.tailSvg || "");
  };

  const handleAutoFillBrief = async () => {
    const animalName = aiPrompt.trim() || guidedBrief.animalName.trim();
    if (!animalName && !uploadedImage) {
      setErrorMsg("Enter an animal name or upload a reference image before auto-filling details.");
      return;
    }
    setIsAutoFillingBrief(true);
    setErrorMsg("");
    setGenerationStep("Gemini 3.6 Flash is preparing the guided prompt details...");
    try {
      const brief = await populateGuidedBrief({ currentBrief: { ...guidedBrief, animalName }, image: uploadedImage, referenceMode, modelId });
      setGuidedBrief(brief);
      setAiPrompt(brief.animalName);
      setGenerationStep("Prompt details populated. Review or edit them before generating.");
    } catch (error: any) {
      setErrorMsg(error?.message || "Could not auto-fill the guided prompt details.");
      setGenerationStep("Prompt auto-fill stopped; your existing details were preserved.");
    } finally {
      setIsAutoFillingBrief(false);
    }
  };

  // §5.3: generate N whole-animal samples in parallel, then let the user pick the best
  // part per slot from a contact sheet. No review/repair loop, no new endpoint.
  const handleGenerateSamples = async () => {
    const animalName = aiPrompt.trim() || guidedBrief.animalName.trim();
    if (!animalName && !uploadedImage) {
      setErrorMsg("Please enter an animal description or upload an inspiring image first.");
      return;
    }
    const brief: GuidedAnimalBrief = { ...guidedBrief, animalName: animalName || guidedBrief.animalName, summary: guidedBrief.summary.trim() || summarizeBrief({ ...guidedBrief, animalName: animalName || guidedBrief.animalName }) };
    setGuidedBrief(brief);
    setIsGenerating(true);
    setErrorMsg("");
    setSamples(null);
    setSampleProgress({ done: 0, total: sampleCount });
    setGenerationStep(`Generating ${sampleCount} variations in parallel (concurrency ${DEFAULT_SAMPLE_CONCURRENCY})...`);
    try {
      const results = await runSampleGeneration({
        prompt: brief.animalName,
        image: uploadedImage,
        referenceMode,
        brief,
        modelId,
        modelIds: sampleModelIds,
        sampleCount,
        concurrency: DEFAULT_SAMPLE_CONCURRENCY,
        onProgress: (done, total) => setSampleProgress({ done, total }),
      });
      const usable = results.filter((sample) => sample.animal).length;
      if (!usable) throw new Error(results.find((sample) => sample.error)?.error || "Every sample failed to generate.");
      setSamples(results);
      setGenerationStep(`Generated ${usable}/${results.length} usable samples. Pick the best part for each slot.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Variation generation failed. Make sure the AI proxy or GEMINI_API_KEY is configured.");
      setGenerationStep("Variation generation stopped.");
    } finally {
      setIsGenerating(false);
      setSampleProgress(null);
    }
  };

  /**
   * §P1: draw the creature as five focused calls instead of one that draws everything —
   * body first, then head, legs and tail in parallel against it. Kept as its own action
   * beside the contact sheet so the proven single-call path stays available while this is
   * being judged.
   */
  const handleGeneratePerPart = async () => {
    const animalName = aiPrompt.trim() || guidedBrief.animalName.trim();
    if (!animalName && !uploadedImage) {
      setErrorMsg("Please enter an animal description or upload an inspiring image first.");
      return;
    }
    const brief: GuidedAnimalBrief = { ...guidedBrief, animalName: animalName || guidedBrief.animalName, summary: guidedBrief.summary.trim() || summarizeBrief({ ...guidedBrief, animalName: animalName || guidedBrief.animalName }) };
    setGuidedBrief(brief);
    setIsGenerating(true);
    setErrorMsg("");
    setSamples(null);
    setSampleProgress({ done: 0, total: PART_TYPES.length });
    setGenerationStep("Drawing the body, then the head, legs and tail against it...");
    try {
      const result = await runPartPipeline({
        brief,
        image: uploadedImage,
        referenceMode,
        // §R3: each part call gets that slot's crop when one is drawn.
        imageForSlot: async (slot) => ({
          image: await referenceForPart(slot as EditablePart),
          cropped: isMeaningfulCrop(referenceCrops[slot as EditablePart]),
        }),
        modelId,
        // §P2: show the model art this artist has already approved for that slot. The client
        // has to supply it — the server cannot read localStorage.
        exemplarsForSlot: (slot) => buildExemplarBlock(slot, bankEntries),
        onProgress: (done, total, slot) => {
          setSampleProgress({ done, total });
          setGenerationStep(`Drew the ${slot} (${done}/${total})...`);
        },
      });
      applyAnimalDraft(result.animal);
      setGenerationMetadata({
        originalRequest: brief.animalName,
        brief,
        plan: result.plan,
        models: { planner: "per-part", generator: modelId || "per-part", reviewer: "n/a", repair: "n/a" },
        promptVersions: { planner: "per-part", generator: "per-part", reviewer: "n/a", repair: "n/a" },
        validationHistory: [result.validation],
        reviewHistory: [],
        repairs: [],
        automaticRepairLimit: 0,
        completedRepairRounds: 0,
        attemptHistory: [],
        bestAttempt: 0,
        stopReason: result.validation.valid ? "approved" : "no-actionable-issues",
        rescueUsed: false,
        finalStatus: result.validation.valid ? "approved" : "warnings",
        createdAt: new Date().toISOString(),
        generatedLayout: result.animal.layoutMetadata,
        referenceMode: uploadedImage ? referenceMode : undefined,
      });
      setPipelinePreviews({ cleanSvg: buildAssembledPreviewSvg(result.animal), diagnosticSvg: buildAssembledPreviewSvg(result.animal, true) });
      setAiMode("refine");
      const failed = result.failedSlots.length ? ` ${result.failedSlots.join(", ")} failed and came back empty.` : "";
      setGenerationStep(`${result.validation.valid ? "Per-part draw passes the deterministic checks." : "Per-part draw finished with warnings."}${failed}`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Per-part generation failed. Make sure the AI proxy or GEMINI_API_KEY is configured.");
      setGenerationStep("Per-part generation stopped.");
    } finally {
      setIsGenerating(false);
      setSampleProgress(null);
    }
  };

  const handleUseSelection = (animal: AnimalDraft, provenance: SampleProvenance) => {
    applyAnimalDraft(animal);
    // Validate the composed frankenstein on physical ground truth only (the validator no
    // longer consults the plan; parts came from different samples anyway).
    const plan = provenance.plan;
    const validation = validateAnimalDraft(animal);
    const metadata: GenerationMetadata = {
      originalRequest: aiPrompt.trim() || guidedBrief.animalName,
      brief: guidedBrief,
      plan: plan ?? FALLBACK_PLAN,
      models: provenance.models ?? { planner: "sampled", generator: "sampled", reviewer: "n/a", repair: "n/a" },
      promptVersions: provenance.promptVersions ?? { planner: "sample", generator: "sample", reviewer: "n/a", repair: "n/a" },
      validationHistory: [validation],
      reviewHistory: [],
      repairs: [],
      automaticRepairLimit: 0,
      completedRepairRounds: 0,
      attemptHistory: [],
      bestAttempt: 0,
      stopReason: validation.valid ? "approved" : "no-actionable-issues",
      rescueUsed: false,
      finalStatus: validation.valid ? "approved" : "warnings",
      createdAt: new Date().toISOString(),
      generatedLayout: animal.layoutMetadata,
      referenceMode: uploadedImage ? referenceMode : undefined,
      metrics: { firstPassGeometrySuccess: validation.valid && !validation.issues.some((entry) => entry.code.startsWith("geometry.")), repairCount: 0, latencyMs: 0 },
    };
    setGenerationMetadata(metadata);
    setPipelinePreviews({ cleanSvg: buildAssembledPreviewSvg(animal), diagnosticSvg: buildAssembledPreviewSvg(animal, true) });
    setSamples(null);
    setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
    setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
    setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
    setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
    setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
    setActiveTweakPart("head");
    setAiMode("refine");
    setGenerationStep(validation.valid ? "Selection applied and passes the deterministic checks. Refine or forge." : "Selection applied with warnings. Refine a part, edit the SVG, or forge as-is.");
  };

  /**
   * Adopt a creature assembled purely from banked parts. Same path as a contact-sheet
   * selection, minus model provenance: these parts came from different runs (or from hand
   * edits), so there is no single generator to attribute the result to.
   */
  const handleUseBankComposition = (animal: AnimalDraft) => {
    applyAnimalDraft(animal);
    const validation = validateAnimalDraft(animal);
    setGenerationMetadata({
      originalRequest: animal.name || "Composed from part bank",
      brief: guidedBrief,
      plan: FALLBACK_PLAN,
      models: { planner: "part-bank", generator: "part-bank", reviewer: "n/a", repair: "n/a" },
      promptVersions: { planner: "bank", generator: "bank", reviewer: "n/a", repair: "n/a" },
      validationHistory: [validation],
      reviewHistory: [],
      repairs: [],
      automaticRepairLimit: 0,
      completedRepairRounds: 0,
      attemptHistory: [],
      bestAttempt: 0,
      stopReason: validation.valid ? "approved" : "no-actionable-issues",
      rescueUsed: false,
      finalStatus: validation.valid ? "approved" : "warnings",
      createdAt: new Date().toISOString(),
      generatedLayout: animal.layoutMetadata,
      metrics: { firstPassGeometrySuccess: validation.valid, repairCount: 0, latencyMs: 0 },
    });
    setPipelinePreviews({ cleanSvg: buildAssembledPreviewSvg(animal), diagnosticSvg: buildAssembledPreviewSvg(animal, true) });
    setShowComposer(false);
    setHeadTx(0); setHeadTy(0); setHeadRot(0); setHeadScale(1); setHeadPivotX(80); setHeadPivotY(80);
    setBodyTx(0); setBodyTy(0); setBodyRot(0); setBodyScale(1); setBodyPivotX(150); setBodyPivotY(110);
    setFrontLegsTx(0); setFrontLegsTy(0); setFrontLegsRot(0); setFrontLegsScale(1); setFrontLegsPivotX(130); setFrontLegsPivotY(90);
    setBackLegsTx(0); setBackLegsTy(0); setBackLegsRot(0); setBackLegsScale(1); setBackLegsPivotX(130); setBackLegsPivotY(90);
    setTailTx(0); setTailTy(0); setTailRot(0); setTailScale(1); setTailPivotX(80); setTailPivotY(80);
    setActiveTweakPart("head");
    setAiMode("refine");
    setGenerationStep(validation.valid ? "Composed from the part bank and passes the deterministic checks." : "Composed from the part bank with warnings. Refine a part or forge as-is.");
  };

  const handleRefineWithAI = async () => {
    if (!refinePrompt.trim() && !uploadedImage) {
      setErrorMsg("Please enter refinement instructions or upload an inspiring image.");
      return;
    }

    setIsGenerating(true);
    setErrorMsg("");
    setGenerationStep(`Refining ${refinePart === "all" ? "the entire creature" : refinePart} with Gemini 3.6 Flash...`);

    try {
      const timers = [
        setTimeout(() => setGenerationStep("Analyzing existing creature anatomy..."), 1200),
        setTimeout(() => setGenerationStep("Re-drawing vector coordinates for selected parts..."), 3000),
        setTimeout(() => setGenerationStep("Re-aligning joints and connections..."), 5000),
        setTimeout(() => setGenerationStep("Polishing final vector outputs..."), 7000),
      ];

      // §R3: a part-targeted refine sends that slot's crop when one is drawn; "all" keeps
      // the whole reference, since the call may touch every part.
      const refineImage = refinePart === "all" ? uploadedImage : await referenceForPart(refinePart);
      const response = await fetch("/api/modify-animal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: refinePrompt.trim(),
          targetPart: refinePart,
          image: refineImage,
          referenceMode,
          referenceCropped: refinePart !== "all" && isMeaningfulCrop(referenceCrops[refinePart]),
          modelId,
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

      if (refinePart !== "all" && !data.modifiedParts?.includes(refinePart)) {
        throw new Error(`Gemini did not return a changed ${refinePart} SVG. Every existing part was preserved.`);
      }
      const changedSvg = (value: unknown, fallback: string) => typeof value === "string" && value.trim() && !/^(?:null|undefined)$/i.test(value.trim()) ? value : fallback;

      if (refinePart === "all") {
        setName(data.name || name);
        setColor(data.color || color);
        setAccentColor(data.accentColor || accentColor);
        setDescription(data.description || description);
      }

      if ((refinePart === "all" || refinePart === "body") && data.bodyConnections) {
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

      if (refinePart === "all") {
        setHeadSvg(changedSvg(data.headSvg, headSvg));
        setBodySvg(changedSvg(data.bodySvg, bodySvg));
        setFrontLegsSvg(changedSvg(data.frontLegsSvg, frontLegsSvg));
        setBackLegsSvg(changedSvg(data.backLegsSvg, backLegsSvg));
        setTailSvg(changedSvg(data.tailSvg, tailSvg));
      } else if (refinePart === "head") setHeadSvg(changedSvg(data.headSvg, headSvg));
      else if (refinePart === "body") setBodySvg(changedSvg(data.bodySvg, bodySvg));
      else if (refinePart === "frontLegs") setFrontLegsSvg(changedSvg(data.frontLegsSvg, frontLegsSvg));
      else if (refinePart === "backLegs") setBackLegsSvg(changedSvg(data.backLegsSvg, backLegsSvg));
      else if (refinePart === "tail") setTailSvg(changedSvg(data.tailSvg, tailSvg));

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
    let finalGenerationMetadata = generationMetadata;
    if (generationMetadata) {
      const validation = validateAnimalDraft({ name, color, accentColor, description: description || name, bodyConnections: { neck: { x: neckX, y: neckY }, tail: { x: tailX, y: tailY }, frontLegs: { x: frontLegsX, y: frontLegsY }, backLegs: { x: backLegsX, y: backLegsY } }, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg, layoutMetadata: generationMetadata.generatedLayout }, generationMetadata.plan);
      finalGenerationMetadata = {
        ...generationMetadata,
        validationHistory: [...generationMetadata.validationHistory, validation],
        finalStatus: validation.valid ? generationMetadata.finalStatus : "warnings",
        forgedWithTechnicalWarnings: !validation.valid || generationMetadata.forgedWithTechnicalWarnings,
        // Record the mode the reference is actually saved under, not the one that happened to
        // be set during generation: the image can be swapped or removed after the fact.
        referenceMode: uploadedImage ? referenceMode : undefined,
      };
      setGenerationMetadata(finalGenerationMetadata);
      if (!validation.valid) console.warn(`Forging with ${validation.issues.filter((entry) => entry.severity === "error").length} unresolved technical validation warning(s).`);
    }

    // Helper to bake the custom transformations into the raw SVG strings via group wraps
    // Built through the shared serialiser so mirror and stretch are baked in too. Composing
    // the string by hand here silently dropped anything not in its fixed parameter list.
    const wrapWithTransform = (svg: string, part: EditablePart, tx: number, ty: number, rot: number, scale: number, px: number, py: number) => {
      const trimmed = svg.trim();
      if (!trimmed) return "";
      const transformAttr = toSvgTransform({
        translateX: tx,
        translateY: ty,
        rotate: rot,
        scale,
        pivotX: px,
        pivotY: py,
        ...partExtras[part],
      });
      if (!transformAttr) return trimmed;
      return `<g transform="${transformAttr}">${trimmed}</g>`;
    };

    const applyShapeTransformsToSvg = (
      svgString: string,
      transforms: Record<string, ShapeTransform>
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
            const t = transforms[node.getAttribute("id") || String(currentIdx)];
            if (t) {
              let tString = "";
              if (t.translateX !== 0 || t.translateY !== 0) {
                tString += `translate(${t.translateX}, ${t.translateY}) `;
              }
              if (t.rotate !== 0) {
                tString += `rotate(${t.rotate}, ${t.pivotX || 0}, ${t.pivotY || 0}) `;
              }
              const scaleX = t.scaleX ?? t.scale;
              const scaleY = t.scaleY ?? t.scale;
              if (scaleX !== 1 || scaleY !== 1) {
                const px = t.pivotX || 0;
                const py = t.pivotY || 0;
                tString += `translate(${px}, ${py}) scale(${scaleX}, ${scaleY}) translate(${-px}, ${-py}) `;
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

    // sanitizeForSave strips the editor's own bookkeeping attributes. They are not in the
    // validator's ALLOWED_ATTRS, so without this every hand-edited part saves with markup
    // that raises svg.attribute errors.
    const bakePart = (svg: string, part: EditablePart) =>
      sanitizeForSave(applyShapeTransformsToSvg(ensureStableSvgLayerIds(svg, part), shapeAdjustments[part]));

    const bakedHeadSvg = bakePart(headSvg, "head");
    const bakedBodySvg = bakePart(bodySvg, "body");
    const bakedFrontLegsSvg = bakePart(frontLegsSvg, "frontLegs");
    const bakedBackLegsSvg = bakePart(backLegsSvg, "backLegs");
    const bakedTailSvg = bakePart(tailSvg, "tail");

    const wrappedHeadSvg = wrapWithTransform(bakedHeadSvg, "head", headTx, headTy, headRot, headScale, headPivotX, headPivotY);
    const wrappedBodySvg = wrapWithTransform(bakedBodySvg, "body", bodyTx, bodyTy, bodyRot, bodyScale, bodyPivotX, bodyPivotY);
    const wrappedFrontLegsSvg = wrapWithTransform(bakedFrontLegsSvg, "frontLegs", frontLegsTx, frontLegsTy, frontLegsRot, frontLegsScale, frontLegsPivotX, frontLegsPivotY);
    const wrappedBackLegsSvg = wrapWithTransform(bakedBackLegsSvg, "backLegs", backLegsTx, backLegsTy, backLegsRot, backLegsScale, backLegsPivotX, backLegsPivotY);
    const wrappedTailSvg = wrapWithTransform(bakedTailSvg, "tail", tailTx, tailTy, tailRot, tailScale, tailPivotX, tailPivotY);

    /**
     * Save through the deterministic layer rather than around it, as
     * docs/svg-editor-handover.md recommends. normalizeGeneratedSvgSyntax folds any stray
     * raw hex onto the nearest ramp token, snaps stroke widths to the §5.2 standard and
     * guarantees the `-root` wrapper — free correctness for hand-edited markup.
     *
     * Then validate, and refuse to save on errors. Warnings (density, fill band) pass: they
     * describe a part that is unusual, not one that is broken.
     */
    const editedDraft = currentDraft({
      headSvg: wrappedHeadSvg, bodySvg: wrappedBodySvg, frontLegsSvg: wrappedFrontLegsSvg,
      backLegsSvg: wrappedBackLegsSvg, tailSvg: wrappedTailSvg,
    });

    let normalized = editedDraft;
    try {
      normalized = normalizeGeneratedSvgSyntax(editedDraft).animal;
    } catch {
      // Normalisation is an improvement pass, never a gate; fall back to the edited draft.
    }

    let blocking: ValidationIssue[] = [];
    try {
      blocking = newErrorsSince(baselineErrors.current, validateAnimalDraft(normalized).issues);
    } catch {
      blocking = [];
    }

    if (blocking.length) {
      setSaveBlocked(blocking);
      setErrorMsg(`This edit introduced ${blocking.length} new problem${blocking.length > 1 ? "s" : ""}. Fix ${blocking.length > 1 ? "them" : "it"} or undo before saving.`);
      return;
    }
    setSaveBlocked([]);

    const finalHeadSvg = normalized.headSvg;
    const finalBodySvg = normalized.bodySvg;
    const finalFrontLegsSvg = normalized.frontLegsSvg;
    const finalBackLegsSvg = normalized.backLegsSvg;
    const finalTailSvg = normalized.tailSvg;

    const animalId = editingAnimal && editingAnimal.id.startsWith("custom-")
      ? editingAnimal.id
      : "custom-" + name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now();

    // §R1 write half: keep the reference with the animal so a later refine session still has
    // it. Fire-and-forget — the animal itself lives in localStorage and must save whether or
    // not IndexedDB cooperates, so a failure here is logged rather than surfaced as a block.
    (referenceRecord
      ? putReferenceImage(animalId, { ...referenceRecord, crops: referenceCrops })
      : deleteReferenceImage(animalId)
    ).catch((error) => console.warn("Could not persist the reference image:", error));

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
      generationMetadata: finalGenerationMetadata,
      rig: rigDefinition,
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
          ty: bodyTy, setTy: setBodyTy,
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

  const setPartSvg = (part: EditablePart, value: string) => {
    if (part === "head") setHeadSvg(value);
    else if (part === "body") setBodySvg(value);
    else if (part === "frontLegs") setFrontLegsSvg(value);
    else if (part === "backLegs") setBackLegsSvg(value);
    else setTailSvg(value);
  };

  const partSvgOf = (part: EditablePart) =>
    part === "head" ? headSvg : part === "body" ? bodySvg : part === "frontLegs" ? frontLegsSvg : part === "backLegs" ? backLegsSvg : tailSvg;

  /**
   * History-aware write to any slot, not just the focused one. The bank and the per-slot
   * re-roll both replace a part the user is not currently tweaking, and both must stay
   * undoable — otherwise inserting the wrong leg is unrecoverable.
   */
  const commitPartSvg = (part: EditablePart, next: string) => {
    const current = partSvgOf(part);
    if (next === current) return;
    setSvgUndo((history) => ({ ...history, [part]: [...history[part].slice(-49), current] }));
    setSvgRedo((history) => ({ ...history, [part]: [] }));
    setPartSvg(part, next);
  };

  const commitActiveSvg = (next: string) => commitPartSvg(activeTweakPart, next);

  /**
   * Replace one slot's entry in the generated layout metadata with the incoming part's own.
   *
   * The invariant `assembleFromPartDrafts` maintains applies here too: each slot's depth
   * groups and ground contacts must describe the art actually kept, or they name group ids
   * that no longer exist in the SVG and the depth split silently stops working.
   */
  const mergeSlotLayout = (
    slot: EditablePart,
    incoming: {
      connection?: BlueprintConnectionProfile;
      groundContacts?: Array<{ x: number; y: number; raised?: boolean }>;
      depthGroups?: { farGroupId: string; nearGroupId: string };
    }
  ) => {
    setGenerationMetadata((current) => {
      if (!current) return current;
      const layout = current.generatedLayout;
      if (!layout) return current;
      const isLimb = slot === "frontLegs" || slot === "backLegs";
      return {
        ...current,
        generatedLayout: {
          ...layout,
          connections: slot === "body"
            ? layout.connections
            : [...layout.connections.filter((entry) => entry.part !== slot), ...(incoming.connection ? [incoming.connection] : [])],
          groundContacts: isLimb
            ? { ...layout.groundContacts, [slot]: incoming.groundContacts }
            : layout.groundContacts,
          depthGroups: isLimb
            ? { ...layout.depthGroups, [slot]: incoming.depthGroups }
            : layout.depthGroups,
        },
      };
    });
  };

  /**
   * Copy-on-apply: the entry is deep-copied into the draft and its SVG ids are namespaced
   * on the way in, so two banked parts that both ship a `#fur` gradient cannot repaint each
   * other. Later edits here never propagate back to the bank.
   */
  const applyBankEntry = (entry: PartBankEntry) => {
    const slot = entry.slot as EditablePart;
    const copy = namespaceEntry(entry, entry.id);
    commitPartSvg(slot, copy.svg);
    if (slot === "body" && copy.bodyConnections) {
      setNeckX(copy.bodyConnections.neck.x); setNeckY(copy.bodyConnections.neck.y);
      setTailX(copy.bodyConnections.tail.x); setTailY(copy.bodyConnections.tail.y);
      setFrontLegsX(copy.bodyConnections.frontLegs.x); setFrontLegsY(copy.bodyConnections.frontLegs.y);
      setBackLegsX(copy.bodyConnections.backLegs.x); setBackLegsY(copy.bodyConnections.backLegs.y);
    }
    mergeSlotLayout(slot, { connection: copy.connection, groundContacts: copy.groundContacts, depthGroups: copy.depthGroups });
    setActiveTweakPart(slot);
    setBankSlot(null);
    setBankNotice(
      `Inserted "${entry.name}"${slot === "body" && copy.bodyConnections ? " with its socket layout" : ""}. Undo restores the previous ${slot}.`
    );
  };

  const saveSlotToBank = (part: EditablePart) => {
    const svg = partSvgOf(part);
    if (!svg.trim()) {
      setBankError(`There is no ${part} art to save yet.`);
      return;
    }
    // `currentDraft()` omits layout metadata, so pass it explicitly — without it the entry
    // would save as bare art and lose the seam profile, ground contacts and depth groups
    // that make a banked part re-composable rather than just re-paintable.
    const entry = savePartToBank(currentDraft({ layoutMetadata: generationMetadata?.generatedLayout }), part, {
      name: `${name.trim() || "Untitled"} ${part}`,
      // Hand-authored art has no generator layout metadata behind it; saying so keeps the
      // bank honest about which entries can carry a seam profile.
      source: generationMetadata ? "generated" : "manual",
      ...(generationMetadata
        ? { provenance: { animalName: name.trim() || undefined, models: generationMetadata.models, promptVersions: generationMetadata.promptVersions } }
        : {}),
    });
    if (entry) setBankNotice(`Saved "${entry.name}" to the part bank.`);
  };

  /**
   * Re-roll a single slot. There is no per-part endpoint, so this generates whole animals
   * and keeps one slot from the pick — the rest of each sample stays offerable to the bank
   * in the picker, so the spend is not wasted.
   */
  const handleRegenerateSlot = async (part: EditablePart) => {
    const animalName = aiPrompt.trim() || guidedBrief.animalName.trim() || name.trim();
    if (!animalName && !uploadedImage) {
      setErrorMsg("Enter an animal name or upload a reference image before re-rolling a part.");
      return;
    }
    const brief: GuidedAnimalBrief = { ...guidedBrief, animalName: animalName || guidedBrief.animalName };
    setRegeneratingSlot(part);
    setErrorMsg("");
    setSlotRegen(null);
    setSampleProgress({ done: 0, total: sampleCount });
    setGenerationStep(`Generating ${sampleCount} new ${part} candidates...`);
    try {
      const results = await runSampleGeneration({
        prompt: brief.animalName,
        image: uploadedImage,
        referenceMode,
        brief,
        modelId,
        modelIds: sampleModelIds,
        sampleCount,
        concurrency: DEFAULT_SAMPLE_CONCURRENCY,
        onProgress: (done, total) => setSampleProgress({ done, total }),
      });
      const usable = results.filter((sample) => sample.animal).length;
      if (!usable) throw new Error(results.find((sample) => sample.error)?.error || "Every sample failed to generate.");
      setSlotRegen({ slot: part, samples: results });
      setGenerationStep(`${usable}/${results.length} usable ${part} candidates. Pick one, and bookmark any others worth keeping.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Part re-roll failed. Make sure the AI proxy or GEMINI_API_KEY is configured.");
      setGenerationStep("Part re-roll stopped.");
    } finally {
      setRegeneratingSlot(null);
      setSampleProgress(null);
    }
  };

  /**
   * "More like this": N variations seeded with one part you already chose.
   *
   * The seed is the *whole* current creature with `seedSvg` substituted into the target
   * slot, not the part alone — `/api/modify-animal` is prompted with every part, so
   * variations come back fitted to the body and limbs they will actually sit on. Passing a
   * lone part would leave the model guessing at its context.
   */
  const runVariationRound = async (slot: EditablePart, seedSvg: string, seedContext?: AnimalDraft) => {
    if (!seedSvg.trim()) {
      setErrorMsg(`There is no ${slot} art to vary yet.`);
      return;
    }
    // `seedContext` matters when the round is started from the contact sheet: the selection
    // has only just been applied, so reading it back out of component state would race and
    // seed the round with the previous creature.
    const base = seedContext ?? currentDraft({ layoutMetadata: generationMetadata?.generatedLayout });
    setVaryingSlot(slot);
    setErrorMsg("");
    setSampleProgress({ done: 0, total: variationCount });
    setGenerationStep(`Generating ${variationCount} ${VARIATION_STRENGTH_WORD[variationStrength]} variations of the ${slot}...`);
    try {
      const partImage = await referenceForPart(slot);
      const results = await runPartVariations({
        seed: { ...base, [PART_SVG_FIELD[slot]]: seedSvg },
        slot,
        strength: variationStrength,
        instructions: variationInstructions,
        count: variationCount,
        concurrency: DEFAULT_VARIATION_CONCURRENCY,
        modelId,
        image: partImage,
        referenceMode,
        cropped: isMeaningfulCrop(referenceCrops[slot]),
        onProgress: (done, total) => setSampleProgress({ done, total }),
      });
      const usable = results.filter((sample) => sample.animal).length;
      if (!usable) throw new Error(results.find((sample) => sample.error)?.error || "Every variation failed.");
      setSlotRegen({
        slot,
        samples: results,
        heading: `${usable} variations of that ${slot}`,
      });
      setGenerationStep(`${usable}/${results.length} usable variations. Pick one, iterate again, or bookmark the rest.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Variation round failed. Make sure the AI proxy or GEMINI_API_KEY is configured.");
      setGenerationStep("Variation round stopped.");
    } finally {
      setVaryingSlot(null);
      setSampleProgress(null);
    }
  };

  const applySlotSample = (slot: EditablePart, sample: GeneratedSample) => {
    const draft = sample.animal;
    if (!draft) return;
    const field = slot === "head" ? "headSvg" : slot === "body" ? "bodySvg" : slot === "frontLegs" ? "frontLegsSvg" : slot === "backLegs" ? "backLegsSvg" : "tailSvg";
    commitPartSvg(slot, String(draft[field] ?? ""));
    if (slot === "body" && draft.bodyConnections) {
      setNeckX(draft.bodyConnections.neck.x); setNeckY(draft.bodyConnections.neck.y);
      setTailX(draft.bodyConnections.tail.x); setTailY(draft.bodyConnections.tail.y);
      setFrontLegsX(draft.bodyConnections.frontLegs.x); setFrontLegsY(draft.bodyConnections.frontLegs.y);
      setBackLegsX(draft.bodyConnections.backLegs.x); setBackLegsY(draft.bodyConnections.backLegs.y);
    }
    const limb = slot === "frontLegs" || slot === "backLegs" ? slot : undefined;
    mergeSlotLayout(slot, {
      connection: draft.layoutMetadata?.connections.find((entry) => entry.part === slot),
      groundContacts: limb ? draft.layoutMetadata?.groundContacts?.[limb] : undefined,
      depthGroups: limb ? draft.layoutMetadata?.depthGroups?.[limb] : undefined,
    });
    setActiveTweakPart(slot);
    setSlotRegen(null);
    setGenerationStep(`Replaced the ${slot} from sample #${sample.index + 1}. Undo restores the previous one.`);
  };

  const undoSvg = () => {
    const stack = svgUndo[activeTweakPart];
    const previous = stack.at(-1);
    if (previous === undefined) return;
    setSvgUndo((history) => ({ ...history, [activeTweakPart]: history[activeTweakPart].slice(0, -1) }));
    setSvgRedo((history) => ({ ...history, [activeTweakPart]: [...history[activeTweakPart], activePartSvgCode] }));
    setPartSvg(activeTweakPart, previous);
  };

  const redoSvg = () => {
    const stack = svgRedo[activeTweakPart];
    const next = stack.at(-1);
    if (next === undefined) return;
    setSvgRedo((history) => ({ ...history, [activeTweakPart]: history[activeTweakPart].slice(0, -1) }));
    setSvgUndo((history) => ({ ...history, [activeTweakPart]: [...history[activeTweakPart], activePartSvgCode] }));
    setPartSvg(activeTweakPart, next);
  };

  useEffect(() => {
    if (!activePartSvgCode.trim()) return;
    const stabilized = ensureStableSvgLayerIds(activePartSvgCode, activeTweakPart);
    if (stabilized !== activePartSvgCode) setPartSvg(activeTweakPart, stabilized);
  }, [activePartSvgCode, activeTweakPart]);

  const shapes = useMemo(() => {
    return activePartSvgCode ? getSvgShapes(activePartSvgCode) : [];
  }, [activePartSvgCode]);

  const layerTree = useMemo(() => activePartSvgCode ? getSvgLayerTree(activePartSvgCode) : [], [activePartSvgCode]);
  const activeLayerIds = useMemo(() => {
    const ids: string[] = [];
    const visit = (nodes: typeof layerTree) => nodes.forEach((node) => { ids.push(node.id); visit(node.children); });
    visit(layerTree);
    return ids;
  }, [layerTree]);

  const rigTransformsByPart = useMemo(() => {
    const transforms: Record<EditablePart, Record<string, string>> = { head: {}, body: {}, frontLegs: {}, backLegs: {}, tail: {} };
    if (!rigDefinition?.joints.length) return transforms;
    try {
      const result = computeForwardKinematics(rigDefinition, rigPoseRotations);
      const localMatrices = computeLocalJointMatrices(rigDefinition, rigPoseRotations);
      const svgByPart: Record<EditablePart, string> = { head: headSvg, body: bodySvg, frontLegs: frontLegsSvg, backLegs: backLegsSvg, tail: tailSvg };
      for (const joint of rigDefinition.joints) if (joint.partId in transforms) {
        let nestedUnderParent = false;
        const parent = joint.parentJointId ? rigDefinition.joints.find((item) => item.id === joint.parentJointId) : undefined;
        if (parent && parent.partId === joint.partId && typeof DOMParser !== "undefined") {
          const document = new DOMParser().parseFromString(`<g>${svgByPart[joint.partId as EditablePart]}</g>`, "image/svg+xml");
          const elements = [...document.querySelectorAll("[id]")];
          const childElement = elements.find((element) => element.id === joint.targetGroupId);
          const parentElement = elements.find((element) => element.id === parent.targetGroupId);
          nestedUnderParent = Boolean(childElement && parentElement?.contains(childElement));
        }
        transforms[joint.partId as EditablePart][joint.targetGroupId] = rigMatrixToSvg(nestedUnderParent ? localMatrices.get(joint.id)! : result.matrices.get(joint.id)!);
      }
    } catch { /* Invalid in-progress parent edits are shown without applying a pose. */ }
    return transforms;
  }, [rigDefinition, rigPoseRotations, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg]);

  const updateLayer = (operation: (svg: string) => string) => commitActiveSvg(operation(activePartSvgCode));

  /**
   * Bend is measured against the part's fixed local view rather than a measured bounding
   * box, so the same slider setting arches any species' torso the same way — which is what
   * keeps parts interchangeable across species.
   */
  const partBounds = (part: EditablePart) => ({
    x: 0,
    y: 0,
    width: VIEW[part as AnimalPartType].width,
    height: VIEW[part as AnimalPartType].height,
  });

  /** Preview only; the part SVG itself is untouched until Apply. */
  const bentActiveSvg = useMemo(
    () => bendPartSvg(activePartSvgCode, partBounds(activeTweakPart), bend),
    [activePartSvgCode, activeTweakPart, bend],
  );

  /**
   * Palette presets are just a primary/accent pair. They work at all only because parts
   * paint with ramp tokens rather than literal colours — every token-painted shape re-tints
   * from these two values.
   */
  const PALETTE_PRESETS: Array<{ name: string; primary: string; accent: string }> = [
    { name: "Fire", primary: "#b23a1b", accent: "#f0a830" },
    { name: "Aquatic", primary: "#1f6f8b", accent: "#7fd6d1" },
    { name: "Shadow", primary: "#2f2f38", accent: "#6d5f9c" },
    { name: "Albino", primary: "#ece7e1", accent: "#d9a7a7" },
    { name: "Forest", primary: "#3f6b3a", accent: "#c8b273" },
  ];

  const applyPattern = () => {
    if (!activeShapeIndex) return;
    const budget = densityAfterDuplication(activePartSvgCode, activeTweakPart as AnimalPartType, 0);
    const { svg, markCount } = applyPatternToShape(activePartSvgCode, activeShapeIndex, {
      ...pattern,
      // Seeded from the host id so re-applying the same settings is reproducible, and two
      // shapes in one part do not get identical coats.
      seed: [...activeShapeIndex].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7),
      maxMarks: Math.max(4, budget.max - budget.count),
    });
    if (!markCount) { setPatternNote("No marks fitted inside that shape — try a smaller scale."); return; }
    commitActiveSvg(svg);
    setPatternNote(`${markCount} marks added (${activeTweakPart} band ${budget.min}–${budget.max}).`);
  };

  const clearPattern = () => {
    if (!activeShapeIndex) return;
    commitActiveSvg(removePatternFromShape(activePartSvgCode, activeShapeIndex));
    setPatternNote("");
  };

  const paintActiveShape = (token: RampToken, channel: "fill" | "stroke") => {
    if (!activeShapeIndex) return;
    commitActiveSvg(setShapeToken(activePartSvgCode, activeShapeIndex, token, channel));
  };

  /** The draft as it currently stands, for validation. */
  const currentDraft = (over?: Partial<AnimalDraft>): AnimalDraft => ({
    name: name || "Untitled",
    color,
    accentColor,
    description: description || name || "Untitled",
    bodyConnections: {
      neck: { x: neckX, y: neckY }, tail: { x: tailX, y: tailY },
      frontLegs: { x: frontLegsX, y: frontLegsY }, backLegs: { x: backLegsX, y: backLegsY },
    },
    headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg,
    ...over,
  });

  /**
   * Live validation feedback — the gap the handover doc calls out: until now a hand-edited
   * part was silently degraded rather than loudly broken.
   *
   * Debounced and keyed only on the values validation actually reads. `validateAnimalDraft`
   * rasterises every part to a pixel mask (`analyzeDraftGeometry`) to measure seams, so
   * running it per render — this dialog re-renders on every keystroke — would stall typing.
   */
  /**
   * Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (plus Ctrl+Y) drive the same per-part history as the
   * toolbar buttons. Skipped while a text field has focus, so the browser's own text undo
   * keeps working where you would expect it.
   */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redoSvg();
      else undoSvg();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, activeTweakPart, activePartSvgCode, svgUndo, svgRedo]);

  // Delete / Backspace removes the selected shape, unless focus is in a text field — the
  // dialog is full of inputs and stealing Backspace from them would be maddening.
  useEffect(() => {
    if (!isOpen || !activeShapeIndex) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      deleteActiveLayer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, activeShapeIndex, activePartSvgCode, activeTweakPart]);

  // A new subject means a new baseline; otherwise one animal's debt would excuse another's.
  useEffect(() => { baselineErrors.current = new Map(); setSaveBlocked([]); }, [isOpen, editingAnimal?.id]);

  useEffect(() => {
    if (!isOpen) return;
    if (![headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg].every((svg) => svg.trim())) {
      setLiveIssues([]);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const issues = validateAnimalDraft(currentDraft()).issues;
        setLiveIssues(issues);
        // The first successful run for this animal establishes what was already wrong.
        if (!baselineErrors.current.size) baselineErrors.current = errorSignature(issues);
      } catch {
        // A half-typed SVG is not yet parseable; the next keystroke will re-run this.
        setLiveIssues([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isOpen, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg, neckX, neckY, tailX, tailY, frontLegsX, frontLegsY, backLegsX, backLegsY, color, accentColor]);

  const applyBend = () => {
    if (!hasBend(bend)) return;
    commitActiveSvg(bentActiveSvg);
    // Keep the point positions, drop the displacement: the shape is now baked in.
    setBend((current) => ({ ...current, points: current.points.map((point) => ({ ...point, offset: 0 })) }));
  };

  const clearBend = () =>
    setBend((current) => ({ ...current, points: current.points.map((point) => ({ ...point, offset: 0 })) }));

  // A pending bend belongs to the part it was dialled for; carrying it to the next part
  // would silently deform something the user never looked at.
  useEffect(() => {
    setBend((current) => ({ ...current, points: current.points.map((point) => ({ ...point, offset: 0 })) }));
    setBendSelection(null);
  }, [activeTweakPart]);

  /** Element count the active part would reach if one more shape were added. */
  const duplicationDensity = () =>
    densityAfterDuplication(activePartSvgCode, activeTweakPart as AnimalPartType);

  const duplicateActiveLayer = () => {
    if (!selection.length) return;
    let svg = activePartSvgCode;
    const copies: string[] = [];
    for (const id of selection) {
      const result = duplicateSvgLayer(svg, id);
      svg = result.svg;
      if (result.newId !== id) copies.push(result.newId);
    }
    commitActiveSvg(svg);
    // Select the copies, so the obvious next move — dragging them aside — just works.
    selectShapes(copies);
  };

  const extendActiveChain = () => {
    if (!activeShapeIndex) return;
    // extendChain needs a measured box; getBBox only works on the live node, so read it here
    // and hand the numbers to the pure function.
    const partGroup = previewStageRef.current?.querySelector(`[data-editor-part="${activeTweakPart}"]`);
    const element = partGroup
      ? [...partGroup.querySelectorAll("[id]")].find((candidate) => candidate.id === activeShapeIndex) as SVGGraphicsElement | undefined
      : undefined;
    if (!element || typeof element.getBBox !== "function") return;
    const box = element.getBBox();
    const { svg, newId } = extendChain(activePartSvgCode, activeShapeIndex, box);
    commitActiveSvg(svg);
    setActiveShapeIndex(newId);
  };
  const moveLayer = (id: string, direction: LayerMove) => updateLayer((svg) => moveSvgLayer(svg, id, direction));

  useEffect(() => {
    if (!selection.length || !previewStageRef.current) { setSelectedLayerBounds(null); return; }
    const partGroup = previewStageRef.current.querySelector(`[data-editor-part="${activeTweakPart}"]`);
    if (!partGroup) { setSelectedLayerBounds(null); return; }
    const boxes = selection
      .map((id) => [...partGroup.querySelectorAll("[id]")].find((candidate) => candidate.id === id))
      .flatMap((element) => {
        const bounds = element ? layerBounds(element as SVGGraphicsElement) : null;
        return bounds ? [bounds] : [];
      });
    const union = unionBounds(boxes);
    // Bounds already include each shape's own transform, so the overlay needs none of its
    // own — which is what lets one box wrap several independently-moved shapes.
    setSelectedLayerBounds(union ? { ...union, transform: "" } : null);
  }, [selection, activePartSvgCode, activeTweakPart]);

  /**
   * Single write path for the body sockets, shared by the canvas handles and the number
   * inputs, so the two can never disagree.
   *
   * Canvas drags arrive already resolved by `resolveAnchorDrag`. Typed input is stored raw
   * and only clamped on blur — clamping each keystroke makes a value like 250 impossible to
   * type, because the leading "2" snaps to the minimum first.
   */
  const handleAnchorChange = (part: AnchorPart, point: { x: number; y: number }) => {
    if (part === "neck") { setNeckX(point.x); setNeckY(point.y); }
    else if (part === "tail") { setTailX(point.x); setTailY(point.y); }
    else if (part === "frontLegs") { setFrontLegsX(point.x); setFrontLegsY(point.y); }
    else { setBackLegsX(point.x); setBackLegsY(point.y); }
  };

  const commitAnchor = (part: AnchorPart) => {
    const current = {
      neck: { x: neckX, y: neckY },
      tail: { x: tailX, y: tailY },
      frontLegs: { x: frontLegsX, y: frontLegsY },
      backLegs: { x: backLegsX, y: backLegsY },
    };
    handleAnchorChange(part, resolveAnchorDrag(part, current[part], current));
  };

  const attachmentPivot = () => activeTweakPart === "head" ? { x: 120, y: 110 }
    : activeTweakPart === "frontLegs" ? { x: 75, y: 15 }
    : activeTweakPart === "backLegs" ? { x: 195, y: 15 }
    : activeTweakPart === "tail" ? { x: 15, y: 15 }
    : { x: neckX, y: neckY };

  /**
   * Double-click a shape on the canvas to select that shape alone.
   *
   * Single click still picks the whole part; the second click drills in, which is the
   * convention every vector editor uses for entering a group.
   *
   * Hit-testing goes through elementsFromPoint rather than the event target because the
   * selection box and anchor handles sit above the artwork and would otherwise swallow
   * every click. Walking the stack lets the first non-chrome shape underneath win.
   */
  const handleStageDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    for (const element of stack) {
      if (element.closest("[data-editor-chrome]")) continue;
      const partGroup = element.closest("[data-editor-part]");
      if (!partGroup || !previewStageRef.current?.contains(partGroup)) continue;
      const shape = element.closest("[id]");
      if (!shape || !partGroup.contains(shape)) continue;
      // Depth groups are suffixed (frontLegs-far); the editor works on the base part.
      const part = (partGroup.getAttribute("data-editor-part") ?? "").split("-")[0] as EditablePart;
      if (part) setActiveTweakPart(part);
      selectShapes(event.shiftKey ? toggleSelection(selection, shape.id) : [shape.id]);
      return;
    }
  };

  const deleteActiveLayer = () => {
    const removable = selection.filter((id) => !isProtectedLayer(id));
    if (!removable.length) return;
    commitActiveSvg(removable.reduce((svg, id) => deleteSvgLayer(svg, id), activePartSvgCode));
    selectShapes([]);
  };

  /** Single write path for selection, so the primary id and the set never disagree. */
  const selectShapes = (ids: string[]) => {
    setSelection(ids);
    setActiveShapeIndex(ids[0] ?? null);
  };

  /**
   * A layer's bounds in the part's coordinate space.
   *
   * `getBBox` ignores the element's own transform, so an already-moved shape would report a
   * stale box. Folding its matrix in keeps every selected shape comparable, which is what
   * lets several of them share one gizmo.
   */
  const layerBounds = (element: SVGGraphicsElement): GizmoBounds | null => {
    if (typeof element.getBBox !== "function") return null;
    try {
      const box = element.getBBox();
      const matrix = element.transform?.baseVal?.consolidate()?.matrix;
      if (!matrix) return { x: box.x, y: box.y, width: Math.max(box.width, 1), height: Math.max(box.height, 1) };
      const corners = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height },
      ].map((point) => ({
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      }));
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return {
        x: Math.min(...xs), y: Math.min(...ys),
        width: Math.max(Math.max(...xs) - Math.min(...xs), 1),
        height: Math.max(Math.max(...ys) - Math.min(...ys), 1),
      };
    } catch { return null; }
  };

  /** Every selectable shape in the active part, with its bounds and lock state. */
  const marqueeCandidates = (): MarqueeCandidate[] => {
    const group = previewStageRef.current?.querySelector(`[data-editor-part="${activeTweakPart}"]`);
    if (!group) return [];
    return [...group.querySelectorAll("[id]")].flatMap((element) => {
      const bounds = layerBounds(element as SVGGraphicsElement);
      if (!bounds || !element.id) return [];
      return [{ id: element.id, bounds, locked: element.getAttribute("data-locked") === "true" }];
    });
  };

  /** Local-space point for the part currently being edited. */
  const partPoint = (clientX: number, clientY: number) => {
    const group = previewStageRef.current?.querySelector(`[data-editor-part="${activeTweakPart}"]`) as SVGGraphicsElement | null;
    const matrix = group?.getScreenCTM();
    if (!group || !matrix || !previewStageRef.current) return { x: clientX, y: clientY };
    const point = previewStageRef.current.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };

  const STAGE_VIEW = { x: 0, y: 0, w: 600, h: 500 };
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 12;
  const zoomLevel = STAGE_VIEW.w / view.w;

  /**
   * Zoom about the pointer, so the detail under the cursor stays under the cursor — the
   * behaviour every map and vector editor uses, and the only one that lets you close in on a
   * small shape without chasing it around the canvas.
   */
  const zoomStage = (factor: number, focus?: { clientX: number; clientY: number }) => {
    setView((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (STAGE_VIEW.w / current.w) * factor));
      const w = STAGE_VIEW.w / next;
      const h = STAGE_VIEW.h / next;
      const stage = previewStageRef.current;
      const rect = stage?.getBoundingClientRect();
      // Fraction of the viewport the pointer sits at; centre when zooming from a button.
      const fx = rect && focus ? (focus.clientX - rect.left) / rect.width : 0.5;
      const fy = rect && focus ? (focus.clientY - rect.top) / rect.height : 0.5;
      const anchorX = current.x + current.w * fx;
      const anchorY = current.y + current.h * fy;
      return { x: anchorX - w * fx, y: anchorY - h * fy, w, h };
    });
  };

  const resetStageView = () => setView(STAGE_VIEW);

  const handleStageWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomStage(event.deltaY < 0 ? 1.15 : 1 / 1.15, event);
  };

  /** Middle-drag, or space-free right-drag, pans without disturbing selection. */
  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    const stage = previewStageRef.current;
    const rect = stage?.getBoundingClientRect();
    if (!stage || !rect) return;
    const originX = event.clientX;
    const originY = event.clientY;
    const from = view;
    const move = (pointer: PointerEvent) => {
      setView({
        x: from.x - ((pointer.clientX - originX) / rect.width) * from.w,
        y: from.y - ((pointer.clientY - originY) / rect.height) * from.h,
        w: from.w,
        h: from.h,
      });
    };
    const finish = () => window.removeEventListener("pointermove", move);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  /**
   * Rubber-band selection.
   *
   * Starts anywhere except on gizmo chrome — handles, anchors and spine points own their own
   * drags. Artwork is fair game: parts cover most of the canvas, so requiring empty space
   * would make the gesture almost impossible to start, and dragging a shape does nothing
   * else today. Selecting a single shape is what double-click is for.
   */
  const startMarquee = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1) { event.preventDefault(); startPan(event); return; }
    const target = event.target as Element;
    if (target.closest("[data-editor-chrome]")) return;
    const origin = partPoint(event.clientX, event.clientY);
    const subtract = event.shiftKey;
    const before = selection;

    const move = (pointer: PointerEvent) => {
      setMarquee(marqueeFromPoints(origin, partPoint(pointer.clientX, pointer.clientY)));
    };
    const finish = (pointer: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      setMarquee(null);
      const box = marqueeFromPoints(origin, partPoint(pointer.clientX, pointer.clientY));
      // A click that drifted a pixel clears the selection rather than boxing nothing.
      if (!isMarqueeMeaningful(box)) { if (!subtract) selectShapes([]); return; }
      selectShapes(applyMarquee(before, idsInside(box, marqueeCandidates()), subtract ? "subtract" : "replace"));
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  /** Live DOM nodes for every selected shape, for direct writes during a drag. */
  const liveSelectedElements = (): SVGGraphicsElement[] => {
    if (!selection.length || !previewStageRef.current) return [];
    const group = previewStageRef.current.querySelector(`[data-editor-part="${activeTweakPart}"]`);
    if (!group) return [];
    const byId = new Map([...group.querySelectorAll("[id]")].map((element) => [element.id, element as SVGGraphicsElement]));
    return selection.flatMap((id) => { const element = byId.get(id); return element ? [element] : []; });
  };

  const startLayerPointerAction = createGizmoDragHandler({
    stageRef: previewStageRef,
    proportional: proportionalLayerScaling,
    anchorPivot: keepLayerAnchorFixed ? attachmentPivot() : null,
    resolveTarget: () => {
      if (!activeShapeIndex || !selectedLayerBounds || !previewStageRef.current) return null;
      const group = previewStageRef.current.querySelector(`[data-editor-part="${activeTweakPart}"]`) as SVGGElement | null;
      if (!group) return null;
      return { group, bounds: selectedLayerBounds, transform: getSvgLayerTransform(activePartSvgCode, activeShapeIndex) };
    },
    /**
     * Write the transform straight to the live node during the drag.
     *
     * The previous version called setSvgLayerTransform on every pointermove — a full
     * DOMParser + XMLSerializer round-trip plus a React re-render per frame, measured at
     * ~11ms even in a production build, which is most of a 60fps budget before the old
     * Android target is even considered. Touching the one attribute costs nothing and, by
     * not setting state, avoids the re-render that would overwrite it.
     */
    onPreview: (next) => {
      // The same editor transform is written to every selected shape. Each keeps its own
      // base transform, so applying one shared transform on top moves them as a unit.
      for (const element of liveSelectedElements()) {
        const base = element.getAttribute("data-base-transform") ?? element.getAttribute("transform") ?? "";
        const combined = [base, toSvgTransform(next)].filter(Boolean).join(" ");
        if (combined) element.setAttribute("transform", combined);
        else element.removeAttribute("transform");
      }
    },
    // The authoritative write happens once, on release. commitActiveSvg pushes undo itself.
    onCommit: (next) => {
      if (!selection.length) return;
      commitActiveSvg(selection.reduce((svg, id) => setSvgLayerTransform(svg, id, next), activePartSvgCode));
    },
  });

  /**
   * The selected layer's gizmo, drawn at stage level rather than inside the part.
   *
   * Anchor handles, their labels and the pivot crosshair are rendered after the parts, so a
   * gizmo nested in a part group sat underneath them: wherever they overlapped, a corner or
   * edge handle showed the wrong cursor and could not be grabbed. Carrying the part's own
   * transform keeps the bounds — which are in part-local space — landing in the right place.
   */
  const renderLayerSelection = () => {
    if (!selection.length || !selectedLayerBounds) return null;
    return (
      <g transform={activePartTransformStr()}>
        <GizmoOverlay bounds={selectedLayerBounds} onPointerAction={startLayerPointerAction} />
      </g>
    );
  };

  const activePartTransformStr = () => activeTweakPart === "head" ? headTransformStr
    : activeTweakPart === "body" ? bodyTransformStr
    : activeTweakPart === "frontLegs" ? frontLegsTransformStr
    : activeTweakPart === "backLegs" ? backLegsTransformStr
    : tailTransformStr;

  const activeT = getActiveTransform();

  const handleResetPart = () => {
    setPartExtras((extras) => ({ ...extras, [activeTweakPart]: {} }));
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
    const highlightIdx = activeTweakPart === partType && activeShapeIndex !== null ? activeShapeIndex : undefined;
    // Show the pending bend live on the active part, without committing it.
    const shown = partType === activeTweakPart && hasBend(bend) ? bentActiveSvg : svgContent;
    return (
      <PartPreview
        svg={shown}
        color={color}
        accentColor={accentColor}
        shapeTransforms={shapeAdjustments[partType]}
        highlightId={highlightIdx}
        rigTransforms={rigTransformsByPart[partType]}
      />
    );
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
  /**
   * Whole-part transform, built through the shared serialiser so the dialog, the main
   * canvas and the layer editor all emit the same shape. The previous inline string put
   * scale before rotate; with a uniform scale about the same pivot the two commute, so
   * existing parts are unaffected, and a stretch now follows the same rotate-then-scale
   * convention as everywhere else.
   */
  const partTransformStr = (part: EditablePart, base: { x: number; y: number }, tx: number, ty: number, rot: number, scale: number, px: number, py: number) =>
    toSvgTransform({
      translateX: base.x + tx,
      translateY: base.y + ty,
      rotate: rot,
      scale,
      pivotX: px,
      pivotY: py,
      ...partExtras[part],
    });

  const headTransformStr = partTransformStr("head", headTranslate, headTx, headTy, headRot, headScale, headPivotX, headPivotY);
  const bodyTransformStr = partTransformStr("body", bodyTranslate, bodyTx, bodyTy, bodyRot, bodyScale, bodyPivotX, bodyPivotY);
  const frontLegsTransformStr = partTransformStr("frontLegs", frontLegsTranslate, frontLegsTx, frontLegsTy, frontLegsRot, frontLegsScale, frontLegsPivotX, frontLegsPivotY);
  const backLegsTransformStr = partTransformStr("backLegs", backLegsTranslate, backLegsTx, backLegsTy, backLegsRot, backLegsScale, backLegsPivotX, backLegsPivotY);
  const tailTransformStr = partTransformStr("tail", tailTranslate, tailTx, tailTy, tailRot, tailScale, tailPivotX, tailPivotY);

  // --- Whole-part gizmo ------------------------------------------------------------------
  // Shown only while no sub-layer is selected, so the part box and the layer box never
  // overlap and it is always unambiguous which one a handle belongs to.
  const [partGizmoBounds, setPartGizmoBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Suppressed while the spine handles are up, so two overlapping control sets on the
  // same part cannot compete for the same drag.
  const showPartGizmo = activeShapeIndex === null && !bendMode;

  const stagePoint = (clientX: number, clientY: number) => {
    const stage = previewStageRef.current;
    const matrix = stage?.getScreenCTM();
    if (!stage || !matrix) return { x: clientX, y: clientY };
    const point = stage.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  };

  useEffect(() => {
    if (!showPartGizmo) { setPartGizmoBounds(null); return; }
    // Measured synchronously, not in requestAnimationFrame — rAF never fires in a hidden
    // tab, which would leave the dialog with no part gizmo until something else nudged it.
    const group = previewStageRef.current?.querySelector(`[data-editor-part="${activeTweakPart}"]`);
    setPartGizmoBounds(group ? rectToStageBounds(group.getBoundingClientRect(), stagePoint) : null);
    // `isOpen` matters as much as the transform values: while the dialog is shut the
    // component still runs its hooks but renders null, so the first measurement happens
    // with no stage attached. Without this dep a freshly opened dialog whose part SVGs are
    // unchanged (a blank draft) would never re-measure and would show no gizmo at all.
  }, [isOpen, showPartGizmo, activeTweakPart, headTransformStr, bodyTransformStr, frontLegsTransformStr, backLegsTransformStr, tailTransformStr, headSvg, bodySvg, frontLegsSvg, backLegsSvg, tailSvg]);

  const activeBaseTranslate = () => activeTweakPart === "head" ? headTranslate
    : activeTweakPart === "body" ? bodyTranslate
    : activeTweakPart === "frontLegs" ? frontLegsTranslate
    : activeTweakPart === "backLegs" ? backLegsTranslate
    : tailTranslate;

  const startPartPointerAction = createGizmoDragHandler({
    stageRef: previewStageRef,
    proportional: !partStretchMode,
    // The part's own pivot, lifted into stage space — rotation and scale turn about the
    // same point the sliders use, not about a bounding-box corner.
    anchorPivot: (() => {
      const t = getActiveTransform();
      const base = activeBaseTranslate();
      return { x: base.x + t.tx + t.px, y: base.y + t.ty + t.py };
    })(),
    resolveTarget: () => {
      if (!partGizmoBounds || !previewStageRef.current) return null;
      const t = getActiveTransform();
      const base = activeBaseTranslate();
      return {
        group: previewStageRef.current,
        bounds: partGizmoBounds,
        transform: {
          translateX: base.x + t.tx,
          translateY: base.y + t.ty,
          rotate: t.rot,
          scale: t.scale,
          pivotX: base.x + t.tx + t.px,
          pivotY: base.y + t.ty + t.py,
          ...partExtras[activeTweakPart],
        },
      };
    },
    onPreview: (next) => {
      const t = getActiveTransform();
      const base = activeBaseTranslate();
      t.setTx(Math.round(next.translateX - base.x));
      t.setTy(Math.round(next.translateY - base.y));
      t.setRot(Math.round(next.rotate));
      const scaleX = next.scaleX ?? next.scale;
      const scaleY = next.scaleY ?? next.scale;
      if (Math.abs(scaleX - scaleY) < 1e-9) {
        t.setScale(scaleX);
        setPartExtras((extras) => ({ ...extras, [activeTweakPart]: { ...extras[activeTweakPart], scaleX: undefined, scaleY: undefined } }));
      } else {
        setPartExtras((extras) => ({ ...extras, [activeTweakPart]: { ...extras[activeTweakPart], scaleX, scaleY } }));
      }
    },
    onCommit: () => {},
  });

  const flipActivePart = (axis: "x" | "y") =>
    setPartExtras((extras) => {
      const key = axis === "x" ? "flipX" : "flipY";
      const next: PartExtras = { ...extras[activeTweakPart] };
      // Toggling off drops the key rather than storing false, so flipping twice returns the
      // part to exactly its previous state.
      if (next[key]) delete next[key];
      else next[key] = true;
      return { ...extras, [activeTweakPart]: next };
    });

  // Rendered at stage level, not inside the part group: its bounds are already in stage
  // coordinates, so nesting it under the part's own transform would apply that twice.
  const renderPartSelection = () =>
    showPartGizmo && partGizmoBounds
      ? <GizmoOverlay bounds={partGizmoBounds} onPointerAction={startPartPointerAction} />
      : null;

  const frontPreviewDepthLayers = splitSvgDepthLayers(frontLegsSvg, generationMetadata?.generatedLayout?.depthGroups.frontLegs);
  const backPreviewDepthLayers = splitSvgDepthLayers(backLegsSvg, generationMetadata?.generatedLayout?.depthGroups.backLegs);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-[#18181b] border border-zinc-800 rounded-2xl w-full max-w-6xl lg:max-w-[110rem] max-h-[95vh] overflow-hidden flex flex-col shadow-2xl my-auto">
        
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* COLUMN 1: Live Interactive Preview & Fine-Tuning Hub */}
            <div className="lg:col-span-7 bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl space-y-3 font-sans lg:h-[74vh] flex flex-col">
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
                  <button type="button" title="Zoom out" onClick={() => zoomStage(1 / 1.3)} className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
                    <ZoomOut size={13} />
                  </button>
                  <button
                    type="button"
                    title="Reset zoom (scroll to zoom, middle-drag to pan)"
                    onClick={resetStageView}
                    className={`px-1.5 py-1 rounded text-[9px] font-mono transition-colors ${zoomLevel === 1 ? "bg-zinc-800 text-zinc-500" : "bg-amber-500/20 text-amber-400"}`}
                  >
                    {zoomLevel.toFixed(1)}x
                  </button>
                  <button type="button" title="Zoom in" onClick={() => zoomStage(1.3)} className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
                    <ZoomIn size={13} />
                  </button>
                  <span className="w-px h-4 bg-zinc-800" />

                  {/* Undo/redo live here as well as in the layers panel: the panel sits far
                      below the preview, and these are needed exactly while looking at it. */}
                  <button
                    type="button"
                    title="Undo layer edit (Ctrl+Z)"
                    disabled={!svgUndo[activeTweakPart].length}
                    onClick={undoSvg}
                    className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-25 transition-colors"
                  >
                    <Undo2 size={13} />
                  </button>
                  <button
                    type="button"
                    title="Redo layer edit (Ctrl+Shift+Z)"
                    disabled={!svgRedo[activeTweakPart].length}
                    onClick={redoSvg}
                    className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-25 transition-colors"
                  >
                    <Redo2 size={13} />
                  </button>
                  <span className="w-px h-4 bg-zinc-800" />
                  <button
                    type="button"
                    title="Spine bend handles — drag the middle dot up for a hump, down for a saddle"
                    onClick={() => setBendMode(!bendMode)}
                    className={`p-1 rounded transition-colors ${bendMode ? "bg-sky-500/20 text-sky-400" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Spline size={13} />
                  </button>
                  {/* Axis lives beside the spine toggle, not only in the panel far below:
                      it is a decision you make while looking at the creature. */}
                  {bendMode && (["x", "y"] as const).map((axis) => (
                    <button
                      key={axis}
                      type="button"
                      title={axis === "x" ? "Bend along a horizontal spine (back to tail)" : "Bend along a vertical spine (upright neck or hanging tail)"}
                      onClick={() => setBend((current) => ({ ...current, axis }))}
                      className={`px-1.5 py-1 rounded text-[9px] font-mono transition-colors ${bend.axis === axis ? "bg-sky-500/20 text-sky-400" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"}`}
                    >
                      {axis === "x" ? "H" : "V"}
                    </button>
                  ))}
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
              <div className="relative w-full flex-1 min-h-[320px] bg-zinc-950 border border-zinc-850 rounded-xl overflow-hidden shadow-inner group">
                <svg
                  ref={previewStageRef}
                  viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                  className="w-full h-full select-none"
                  xmlns="http://www.w3.org/2000/svg"
                  onDoubleClick={handleStageDoubleClick}
                  onPointerDown={startMarquee}
                  onWheel={handleStageWheel}
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
                    <g data-editor-part="tail" transform={tailTransformStr}>
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

                  {/* 2. FAR HIND LIMB (or complete legacy hind-limb part) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "backLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("backLegs")}
                  >
                    <g data-editor-part="backLegs" transform={backLegsTransformStr}>
                      {renderPartPreview("backLegs", backPreviewDepthLayers?.far ?? backLegsSvg)}
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

                  {/* 3. FAR FORELIMB (semantic generated parts only) */}
                  {frontPreviewDepthLayers && (
                    <g
                      className={`cursor-pointer transition-all ${activeTweakPart === "frontLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                      onClick={() => setActiveTweakPart("frontLegs")}
                    >
                      <g data-editor-part="frontLegs-far" transform={frontLegsTransformStr}>
                        {renderPartPreview("frontLegs", frontPreviewDepthLayers.far)}
                      </g>
                    </g>
                  )}

                  {/* 4. BODY LAYER */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "body" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("body")}
                  >
                    <g data-editor-part="body" transform={bodyTransformStr}>
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

                  {/* 5. NEAR HIND LIMB (semantic generated parts only) */}
                  {backPreviewDepthLayers && (
                    <g
                      className={`cursor-pointer transition-all ${activeTweakPart === "backLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                      onClick={() => setActiveTweakPart("backLegs")}
                    >
                      <g data-editor-part="backLegs-near" transform={backLegsTransformStr}>
                        {renderPartPreview("backLegs", backPreviewDepthLayers.near)}
                      </g>
                    </g>
                  )}

                  {/* 6. NEAR FORELIMB (or complete legacy forelimb part) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "frontLegs" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("frontLegs")}
                  >
                    <g data-editor-part="frontLegs" transform={frontLegsTransformStr}>
                      {renderPartPreview("frontLegs", frontPreviewDepthLayers?.near ?? frontLegsSvg)}
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

                  {/* 7. HEAD LAYER (In front of body) */}
                  <g 
                    className={`cursor-pointer transition-all ${activeTweakPart === "head" ? "opacity-100" : "opacity-80 hover:opacity-95"}`}
                    onClick={() => setActiveTweakPart("head")}
                  >
                    <g data-editor-part="head" transform={headTransformStr}>
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
                      <circle cx={backLegsTranslate.x + backLegsTx + backLegsLocalBody.x} cy={backLegsTranslate.y + backLegsTy + backLegsLocalBody.y} r="3" fill="#ffffff" />
                    </g>
                  )}

                  {/* Draggable body sockets. Outside the pointerEvents="none" skeleton group
                      above, which draws the links but must not swallow the drags. */}
                  {showPreviewSkeleton && (
                    <AnchorHandles
                      stageRef={previewStageRef}
                      anchors={{
                        neck: { x: neckX, y: neckY },
                        tail: { x: tailX, y: tailY },
                        frontLegs: { x: frontLegsX, y: frontLegsY },
                        backLegs: { x: backLegsX, y: backLegsY },
                      }}
                      bodyOrigin={{ x: bodyTranslate.x + bodyTx, y: bodyTranslate.y + bodyTy }}
                      onChange={handleAnchorChange}
                      activePart={draggingAnchor}
                      onActivePartChange={setDraggingAnchor}
                    />
                  )}

                  {marquee && (
                    <rect
                      data-editor-chrome="true"
                      data-testid="marquee"
                      transform={`translate(${activeBaseTranslate().x + getActiveTransform().tx}, ${activeBaseTranslate().y + getActiveTransform().ty})`}
                      x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}
                      fill="rgba(56,189,248,.08)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 2"
                      pointerEvents="none"
                    />
                  )}

                  {renderPartSelection()}
                  {renderLayerSelection()}

                  {/* Bend handles last, so they sit above every part. Positioned by the
                      active part's translation only — inheriting its scale or flip would
                      mirror the controls along with the artwork. */}
                  {bendMode && (() => {
                    const base = activeBaseTranslate();
                    const t = getActiveTransform();
                    return (
                      <BendHandles
                        stageRef={previewStageRef}
                        placement={`translate(${base.x + t.tx}, ${base.y + t.ty})`}
                        width={VIEW[activeTweakPart as AnimalPartType].width}
                        height={VIEW[activeTweakPart as AnimalPartType].height}
                        axis={bend.axis}
                        points={bend.points}
                        selectedIndex={bendSelection}
                        onChange={(points) => setBend((current) => ({ ...current, points }))}
                        onSelect={setBendSelection}
                      />
                    );
                  })()}

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
                      <g pointerEvents="none">
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
            </div>

            {/* CONTROLS — beside the preview, matched in height and scrolling on
                their own, so a slider is never more than a glance from the shape
                it changes. */}
            <div className="lg:col-span-5 bg-zinc-900/30 border border-zinc-800 p-4 rounded-2xl space-y-4 font-sans lg:h-[74vh] lg:overflow-y-auto">

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

                {/* Mirror + stretch, matching the main canvas controls */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => flipActivePart("x")}
                      title="Mirror this part horizontally"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors ${partExtras[activeTweakPart].flipX ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                    >
                      <FlipHorizontal size={10} /> Flip H
                    </button>
                    <button
                      type="button"
                      onClick={() => flipActivePart("y")}
                      title="Mirror this part vertically"
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] transition-colors ${partExtras[activeTweakPart].flipY ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
                    >
                      <FlipVertical size={10} /> Flip V
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-[9px] text-zinc-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={partStretchMode}
                      onChange={(e) => {
                        setPartStretchMode(e.target.checked);
                        // Leaving stretch mode folds the axes back onto the uniform scale.
                        if (!e.target.checked) {
                          const extras = partExtras[activeTweakPart];
                          const sx = extras.scaleX ?? activeT.scale;
                          const sy = extras.scaleY ?? activeT.scale;
                          activeT.setScale((sx + sy) / 2);
                          setPartExtras((all) => ({ ...all, [activeTweakPart]: { ...all[activeTweakPart], scaleX: undefined, scaleY: undefined } }));
                        }
                      }}
                      className="accent-amber-500"
                    />
                    Stretch
                  </label>
                </div>

                {partExtras[activeTweakPart].flipX && activeTweakPart !== "frontLegs" && activeTweakPart !== "backLegs" && (
                  <p className="text-[9px] text-amber-500/80 leading-tight">
                    Mirrored {activeTweakPart}: the library is authored left-facing, so this part
                    may be rejected when combined across species.
                  </p>
                )}

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

                  {/* Scale — uniform, or one slider per axis while stretching */}
                  {partStretchMode ? (
                    (["x", "y"] as const).map((axis) => {
                      const key = axis === "x" ? "scaleX" : "scaleY";
                      const value = partExtras[activeTweakPart][key] ?? activeT.scale;
                      return (
                        <div key={axis} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-zinc-400">Stretch {axis.toUpperCase()}</span>
                            <span className="text-amber-500 font-bold">x{value.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.3"
                            max="2.5"
                            step="0.05"
                            value={value}
                            onChange={(e) => {
                              const next = parseFloat(e.target.value) || 1.0;
                              // Seed the untouched axis from the uniform scale, so moving one
                              // slider stretches rather than silently resetting the other.
                              setPartExtras((all) => ({
                                ...all,
                                [activeTweakPart]: {
                                  ...all[activeTweakPart],
                                  scaleX: axis === "x" ? next : all[activeTweakPart].scaleX ?? activeT.scale,
                                  scaleY: axis === "y" ? next : all[activeTweakPart].scaleY ?? activeT.scale,
                                },
                              }));
                            }}
                            className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      );
                    })
                  ) : (
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
                        onChange={(e) => {
                          activeT.setScale(parseFloat(e.target.value) || 1.0);
                          // Per-axis values are spread over this one, so a leftover stretch
                          // would make the uniform slider look dead. Reaching for it means
                          // the user wants uniform scaling again.
                          setPartExtras((all) => ({ ...all, [activeTweakPart]: { ...all[activeTweakPart], scaleX: undefined, scaleY: undefined } }));
                        }}
                        className="w-full accent-amber-500 bg-zinc-800 h-1 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  )}

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

                {/* Live validation — errors block the save, warnings do not */}
                {(() => {
                  const shown = saveBlocked.length ? saveBlocked : liveIssues;
                  if (!shown.length) return null;
                  const errors = shown.filter((i) => i.severity === "error");
                  const warnings = shown.filter((i) => i.severity !== "error");
                  return (
                    <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-2 font-mono">
                      <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 text-zinc-400">
                        <ShieldAlert size={11} className={errors.length ? "text-red-400" : "text-amber-500"} />
                        Standard Check
                        <span className={errors.length ? "text-red-400" : "text-amber-500"}>
                          {errors.length} error{errors.length === 1 ? "" : "s"} · {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {[...errors, ...warnings].slice(0, 12).map((issue, index) => (
                          <div
                            key={`${issue.code}-${issue.part}-${index}`}
                            className={`text-[9px] leading-tight px-1.5 py-1 rounded border ${
                              issue.severity === "error"
                                ? "border-red-900/60 bg-red-950/30 text-red-300"
                                : "border-amber-900/50 bg-amber-950/20 text-amber-300/90"
                            }`}
                          >
                            <span className="opacity-60">{issue.part} · {issue.code}</span>
                            <br />
                            {issue.message}
                          </div>
                        ))}
                      </div>
                      <p className="text-[9px] text-zinc-500 leading-tight">
                        {saveBlocked.length
                          ? "These were introduced by this edit and block saving."
                          : errors.length > 0
                            ? "Pre-existing faults in this animal — they do not block saving, but this edit must not add more."
                            : "Warnings describe an unusual part, not a broken one; they save fine."}
                      </p>
                    </div>
                  );
                })()}

                {/* Palette presets — retint every token-painted shape at once */}
                <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-2 font-mono">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Palette size={11} /> Palette Presets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => { setColor(preset.primary); setAccentColor(preset.accent); }}
                        className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[9px] text-zinc-300"
                      >
                        <span className="flex">
                          <span className="w-2.5 h-2.5 rounded-l" style={{ background: preset.primary }} />
                          <span className="w-2.5 h-2.5 rounded-r" style={{ background: preset.accent }} />
                        </span>
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Coat pattern, clipped to the selected shape */}
                <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-2.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Grid size={11} /> Coat Pattern
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={!activeShapeIndex} onClick={clearPattern} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 disabled:opacity-25">CLEAR</button>
                      <button type="button" disabled={!activeShapeIndex} onClick={applyPattern} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 disabled:opacity-25">APPLY</button>
                    </div>
                  </div>

                  {!activeShapeIndex ? (
                    <p className="text-[9px] text-zinc-500 italic">Select a layer below to stencil a pattern onto it.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {PATTERN_KINDS.map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => setPattern((p) => ({ ...p, kind }))}
                            className={`px-1.5 py-0.5 rounded text-[9px] capitalize ${pattern.kind === kind ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-300"}`}
                          >
                            {kind}
                          </button>
                        ))}
                      </div>

                      {/* Seven ramp tokens, not an RGB picker: a literal hex would make the
                          part permanently un-recolourable inside a hybrid. */}
                      <div className="space-y-1">
                        <span className="text-[9px] text-zinc-400">Mark colour</span>
                        <div className="flex flex-wrap gap-1">
                          {RAMP_TOKENS.map((token) => (
                            <button
                              key={token}
                              type="button"
                              title={token}
                              onClick={() => setPattern((p) => ({ ...p, token }))}
                              className={`w-5 h-5 rounded border ${pattern.token === token ? "border-amber-400" : "border-zinc-700"}`}
                              style={{ background: resolveRamp(color, accentColor)[token] }}
                            />
                          ))}
                        </div>
                      </div>

                      {([["scale", "Mark scale", 0.2, 2.5, 0.05], ["density", "Density", 0.05, 1, 0.05]] as const).map(([key, label, min, max, step]) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-zinc-400">{label}</span>
                            <span className="text-amber-500 font-bold">{pattern[key].toFixed(2)}</span>
                          </div>
                          <input
                            type="range" min={min} max={max} step={step} value={pattern[key]}
                            onChange={(e) => setPattern((p) => ({ ...p, [key]: parseFloat(e.target.value) }))}
                            className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                          />
                        </div>
                      ))}

                      <div className="space-y-1">
                        <span className="text-[9px] text-zinc-400">Repaint this layer</span>
                        <div className="flex flex-wrap gap-1">
                          {RAMP_TOKENS.map((token) => (
                            <button
                              key={token}
                              type="button"
                              title={`Fill with ${token} (shift-click for stroke)`}
                              onClick={(e) => paintActiveShape(token, e.shiftKey ? "stroke" : "fill")}
                              className="w-5 h-5 rounded border border-zinc-700 hover:border-zinc-400"
                              style={{ background: resolveRamp(color, accentColor)[token] }}
                            />
                          ))}
                        </div>
                      </div>

                      {patternNote && <p className="text-[9px] text-zinc-500 leading-tight">{patternNote}</p>}
                    </>
                  )}
                </div>

                {/* Spine bend — arch a back, sink a saddle, raise a hump */}
                <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-2.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Spline size={11} /> Spine Bend ({activeTweakPart})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!hasBend(bend)}
                        onClick={clearBend}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 disabled:opacity-25"
                      >
                        CLEAR
                      </button>
                      <button
                        type="button"
                        disabled={!hasBend(bend)}
                        onClick={applyBend}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 disabled:opacity-25"
                      >
                        APPLY
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {(["x", "y"] as const).map((axis) => (
                        <button
                          key={axis}
                          type="button"
                          onClick={() => setBend((current) => ({ ...current, axis }))}
                          className={`px-1.5 py-0.5 rounded text-[9px] ${bend.axis === axis ? "bg-sky-500/20 text-sky-300" : "bg-zinc-800 text-zinc-300"}`}
                        >
                          {axis === "x" ? "Horizontal" : "Vertical"}
                        </button>
                      ))}
                    </div>
                    <span className="text-[9px] text-zinc-500">{bend.points.length} points</span>
                  </div>

                  {/* Fine control for whichever handle is selected; the canvas does the
                      coarse shaping. */}
                  {bendSelection !== null && bend.points[bendSelection] ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-zinc-400">
                          Point {bendSelection + 1} lift {bend.points[bendSelection].offset >= 0 ? "(hump)" : "(saddle)"}
                        </span>
                        <span className="text-amber-500 font-bold">{bend.points[bendSelection].offset}px</span>
                      </div>
                      <input
                        type="range" min="-60" max="60" step="1"
                        value={bend.points[bendSelection].offset}
                        onChange={(e) => {
                          const offset = parseInt(e.target.value) || 0;
                          setBend((current) => ({
                            ...current,
                            points: current.points.map((point, index) => index === bendSelection ? { ...point, offset } : point),
                          }));
                        }}
                        className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                      />
                    </div>
                  ) : (
                    <p className="text-[9px] text-zinc-500 italic leading-tight">
                      Turn on the spine tool above the preview, then drag a dot. Double-click the
                      guide line to add a point, alt-click a dot to remove it.
                    </p>
                  )}
                </div>

                {/* SUB-SHAPE ADJUSTER INTEGRATION */}
                <div className="border-t border-zinc-800/80 pt-4 mt-4 space-y-3 font-sans">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest font-mono">
                      <SlidersHorizontal size={12} />
                      Sub-Shape Adjuster ({activeTweakPart})
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" title="Undo layer edit" disabled={!svgUndo[activeTweakPart].length} onClick={undoSvg} className="p-1 rounded bg-zinc-800 text-zinc-300 disabled:opacity-25"><Undo2 size={10}/></button>
                      <button type="button" title="Redo layer edit" disabled={!svgRedo[activeTweakPart].length} onClick={redoSvg} className="p-1 rounded bg-zinc-800 text-zinc-300 disabled:opacity-25"><Redo2 size={10}/></button>
                    {activeShapeIndex !== null && (
                      <>
                        <button
                          type="button"
                          title="Duplicate this layer"
                          onClick={duplicateActiveLayer}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <Copy size={10} />
                        </button>
                        <button
                          type="button"
                          title="Append a tapered copy at this segment's tip (tails, tentacles, necks)"
                          onClick={extendActiveChain}
                          className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <GitBranch size={10} />
                        </button>
                        <button
                          type="button"
                          disabled={isProtectedLayer(activeShapeIndex)}
                          title={isProtectedLayer(activeShapeIndex)
                            ? "This group is required by the pipeline and cannot be deleted"
                            : "Delete this shape (Del)"}
                          onClick={deleteActiveLayer}
                          className="p-1 rounded bg-zinc-800 hover:bg-red-900/60 text-zinc-300 disabled:opacity-25 disabled:hover:bg-zinc-800"
                        >
                          <Trash2 size={10} />
                        </button>
                      </>
                    )}
                    {activeShapeIndex !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          commitActiveSvg(selection.reduce((svg, id) => resetSvgLayerTransform(svg, id), activePartSvgCode));
                          selectShapes([]);
                        }}
                        className="text-[9px] font-mono font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-1.5 py-0.5 rounded transition-colors"
                      >
                        RESET SHAPE
                      </button>
                    )}
                    </div>
                  </div>

                  {shapes.length === 0 ? (
                    <div className="text-[10px] text-zinc-500 font-mono italic p-3 bg-zinc-950/40 rounded-lg border border-zinc-900/60 text-center">
                      No vector shapes detected for {activeTweakPart}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeShapeIndex !== null && (() => {
                        const density = duplicationDensity();
                        return (
                          <p className={`text-[9px] font-mono leading-tight ${density.withinBand ? "text-zinc-500" : "text-amber-500/90"}`}>
                            Duplicating puts {activeTweakPart} at {density.count} elements
                            {density.withinBand
                              ? ` (band ${density.min}–${density.max}).`
                              : `, outside the ${density.min}–${density.max} band — still saves, but flags density.count.`}
                          </p>
                        );
                      })()}

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] text-zinc-400 font-mono block">Stable SVG Layers</label>
                          {selection.length > 1 && <span className="text-[9px] font-mono text-sky-400">{selection.length} selected</span>}
                        </div>
                        <SvgLayersPanel
                          layers={layerTree}
                          selectedId={activeShapeIndex}
                          onSelect={(id, additive) => selectShapes(additive ? toggleSelection(selection, id) : [id])}
                          selectedIds={selection}
                          onRename={(id, value) => updateLayer((svg) => renameSvgLayer(svg, id, value))}
                          onVisibility={(id, visible) => updateLayer((svg) => setSvgLayerVisibility(svg, id, visible))}
                          onLock={(id, locked) => {
                            updateLayer((svg) => setSvgLayerLocked(svg, id, locked));
                            if (locked && selection.includes(id)) selectShapes(selection.filter((entry) => entry !== id));
                          }}
                          onMove={moveLayer}
                        />
                      </div>

                      {activeShapeIndex !== null && (
                        <div className="space-y-2.5 p-2.5 bg-zinc-950/50 rounded-lg border border-zinc-900/60 animate-fade-in">
                          {/* Sub-shape transform inputs */}
                          {(() => {
                            const currentTransform: ShapeTransform = getSvgLayerTransform(activePartSvgCode, activeShapeIndex);

                            const updateTransform = (fields: Partial<ShapeTransform>) => {
                              const fixedPivot = activeTweakPart === "head" ? { pivotX: 120, pivotY: 110 }
                                : activeTweakPart === "frontLegs" ? { pivotX: 75, pivotY: 15 }
                                : activeTweakPart === "backLegs" ? { pivotX: 195, pivotY: 15 }
                                : activeTweakPart === "tail" ? { pivotX: 15, pivotY: 15 }
                                : { pivotX: neckX, pivotY: neckY };
                              const next = { ...currentTransform, ...(keepLayerAnchorFixed && fields.scale !== undefined ? fixedPivot : {}), ...fields };
                              commitActiveSvg(setSvgLayerTransform(activePartSvgCode, activeShapeIndex, next));
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
                                    <span className="text-amber-500 font-bold">X {(currentTransform.scaleX ?? currentTransform.scale ?? 1).toFixed(2)} · Y {(currentTransform.scaleY ?? currentTransform.scale ?? 1).toFixed(2)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0.2"
                                    max="3"
                                    step="0.05"
                                    value={currentTransform.scale !== undefined ? currentTransform.scale : 1}
                                    onChange={(e) => updateTransform({ scale: parseFloat(e.target.value) || 1.0, scaleX: undefined, scaleY: undefined })}
                                    className="w-full accent-amber-500 bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                <label className="flex items-center gap-2 text-[9px] text-zinc-400">
                                  <input type="checkbox" checked={keepLayerAnchorFixed} onChange={(event) => setKeepLayerAnchorFixed(event.target.checked)} className="accent-amber-500" />
                                  Keep attachment anchor fixed while scaling
                                </label>
                                <label className="flex items-center gap-2 text-[9px] text-zinc-400">
                                  <input type="checkbox" checked={proportionalLayerScaling} onChange={(event) => setProportionalLayerScaling(event.target.checked)} className="accent-amber-500" />
                                  Proportional corner/side resizing
                                </label>

                                <div className="grid grid-cols-2 gap-2">
                                  <label className="text-[9px] text-zinc-400">Pivot X<input type="number" value={currentTransform.pivotX ?? 0} onChange={(event) => updateTransform({ pivotX: Number(event.target.value) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-zinc-300" /></label>
                                  <label className="text-[9px] text-zinc-400">Pivot Y<input type="number" value={currentTransform.pivotY ?? 0} onChange={(event) => updateTransform({ pivotY: Number(event.target.value) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-1 text-zinc-300" /></label>
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
              <RigEditorPanel
                partId={activeTweakPart}
                selectedGroupId={activeShapeIndex}
                groupIds={activeLayerIds}
                defaultPivot={attachmentPivot()}
                rig={rigDefinition}
                rotations={rigPoseRotations}
                onRigChange={setRigDefinition}
                onRotationsChange={setRigPoseRotations}
              />
            </div>
          </div>
          
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
                    AI Creature Lab <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-normal font-sans tracking-normal capitalize">Powered by Gemini 3.6 Flash</span>
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

            {/* Model selector — the chosen model drives every AI call (auto-fill, generation, refine) */}
            {models.length > 1 && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <span className="text-[10px] font-mono uppercase font-bold text-amber-500/90">Model</span>
                <select
                  value={modelId}
                  disabled={isGenerating || isAutoFillingBrief}
                  onChange={(event) => setModelId(event.target.value)}
                  className="flex-1 text-[11px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}{model.vision === false ? " — text only" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {blindWithReference && (
              <p className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-300">
                A reference image is attached, but <span className="font-mono">{modelId.replace(/^(proxy|gemini|cline):/, "")}</span> is text only and will reject it.
                Pick a model without the “text only” note, or remove the reference.
              </p>
            )}

            {/*
              §P3 multi-model contact sheet. Model choice moves quality far more than the
              emphasis paragraphs do, so a sheet can draw its samples from several models and
              label each candidate with the one that drew it. Off by default: with nothing
              ticked the round runs entirely on the model chosen above.
            */}
            {models.length > 1 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <span className="text-[10px] font-mono uppercase font-bold text-amber-500/90">Also sample</span>
                {models.filter((model) => model.id !== modelId).map((model) => {
                  const on = sheetModelIds.includes(model.id);
                  return (
                    <button
                      key={model.id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setSheetModelIds((current) => on ? current.filter((id) => id !== model.id) : [...current, model.id])}
                      title={`Include ${model.label} in contact sheets and part re-rolls`}
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-mono transition-colors disabled:opacity-40 ${
                        on ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {model.label.replace(/ · (proxy|Gemini)$/, "")}
                    </button>
                  );
                })}
                <span className="text-[9px] font-sans text-zinc-500">
                  {sheetModelIds.length
                    ? `Samples rotate across ${sampleModelIds.length} models; each candidate is labelled with the one that drew it.`
                    : "Contact sheets and part re-rolls use only the model above."}
                </span>
              </div>
            )}

            {/* Main Interactive Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">

              {/* Left Column: Optional Visual Reference */}
              <div className="md:col-span-4 flex flex-col justify-between">
                <label className="text-[10px] font-mono text-amber-500/95 uppercase font-bold mb-1.5 block">
                  Optional Visual Reference:
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
                          Reference Loaded
                        </p>
                        <p className="text-[9px] font-sans text-zinc-500">
                          {referenceRecord
                            ? `${referenceRecord.width}×${referenceRecord.height} · ${Math.max(1, Math.round(referenceRecord.blob.size / 1024))} KB · saved with this animal`
                            : "Used during planning, review and repair"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearReferenceImage}
                        className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-red-500/20 hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded-lg transition-all active:scale-95 shadow"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : referenceLoading ? (
                    <div className="flex flex-col items-center justify-center gap-1 text-center">
                      <Loader2 size={16} className="animate-spin text-amber-500" />
                      <span className="text-[10px] font-mono text-zinc-400">Preparing reference…</span>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center text-center w-full h-full py-1">
                      <Upload size={16} className="text-zinc-500 group-hover:text-amber-500 mb-1 transition-colors" />
                      <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors">
                        Drop image or click to browse
                      </span>
                      <span className="text-[8px] text-zinc-600 mt-0.5">
                        PNG, JPG, WebP up to 5MB · resized to 512px
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
                {uploadedImage && (
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                    {([[
                      "match", "CLOSE MATCH"
                    ], ["inspire", "LOOSE INSPIRATION"]] as Array<[ReferenceMode, string]>).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setReferenceMode(mode)}
                        className={`rounded px-2 py-1.5 text-[8px] font-mono font-bold transition-colors ${referenceMode === mode ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Text Prompts & Action triggers */}
              <div className="md:col-span-8 flex flex-col justify-end">
                {aiMode === "summon" ? (
                  <div className="flex flex-col gap-2.5 w-full">
                    <label className="text-[9px] font-mono text-zinc-400 uppercase">Preset
                      <select value={guidedBrief.preset} disabled={isGenerating || isAutoFillingBrief} onChange={(event) => setGuidedBrief((current) => applyPreset(current, event.target.value as GuidedAnimalBrief["preset"]))} className="mt-1 w-full text-[10px] p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200">
                        {GENERATION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-mono text-amber-500/95 uppercase font-bold block">Animal name (required)</label>
                    <input
                      type="text"
                      disabled={isGenerating || isAutoFillingBrief}
                      placeholder="e.g. cow"
                      value={aiPrompt}
                      onChange={(e) => { setAiPrompt(e.target.value); updateBriefField("animalName", e.target.value); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleGenerateSamples();
                        }
                      }}
                      className="w-full text-xs font-mono px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                    />
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2">
                      <button
                        type="button"
                        disabled={isGenerating || isAutoFillingBrief}
                        onClick={handleGenerateSamples}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-100 px-3 py-2 text-xs font-mono font-bold text-zinc-950 transition-all hover:bg-white active:scale-95 disabled:pointer-events-none disabled:bg-zinc-800 disabled:text-zinc-600"
                      >
                        {isGenerating && sampleProgress ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                        {isGenerating && sampleProgress ? `SAMPLING ${sampleProgress.done}/${sampleProgress.total}` : "GENERATE VARIATIONS"}
                      </button>
                      <label className="flex items-center gap-1 text-[9px] font-mono uppercase text-zinc-400">
                        samples
                        <select value={sampleCount} disabled={isGenerating || isAutoFillingBrief} onChange={(event) => setSampleCount(Number(event.target.value))} className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[10px] text-zinc-200">
                          {[2, 3, 4, 6, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                        </select>
                      </label>
                      <span className="text-[9px] leading-snug text-zinc-500">Best part-per-slot from N parallel draws — no repair loop.</span>
                    </div>
                    {/*
                      §P1: the per-part path, alongside the contact sheet rather than
                      replacing it. Five focused calls (body, then the rest in parallel)
                      instead of one call that draws everything at a 16k output ceiling.
                    */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isGenerating || isAutoFillingBrief}
                        onClick={handleGeneratePerPart}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-600/60 bg-amber-500/10 px-3 py-2 text-xs font-mono font-bold text-amber-400 transition-all hover:bg-amber-500/20 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {isGenerating && sampleProgress ? <Loader2 size={14} className="animate-spin" /> : <Spline size={14} />}
                        DRAW PART BY PART
                      </button>
                      <span className="text-[9px] leading-snug text-zinc-500">One focused call per slot: body first, then head, legs and tail drawn to fit it.</span>
                    </div>
                    <button
                      type="button"
                      disabled={isGenerating || isAutoFillingBrief}
                      onClick={handleAutoFillBrief}
                      className="self-start rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[9px] font-mono font-bold text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40 flex items-center gap-2"
                    >
                      {isAutoFillingBrief ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {isAutoFillingBrief ? "AUTO-FILLING DETAILS..." : "AUTO-FILL DETAILS WITH GEMINI 3.6 FLASH"}
                    </button>
                    <details className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2">
                      <summary className="cursor-pointer text-[10px] font-mono font-bold text-amber-400">GUIDED BRIEF OPTIONS</summary>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                        {([
                          ["sexOrVariant", "Sex / variant", ["neutral", "female", "male", "cow", "bull"]],
                          ["age", "Age", ["young", "adult", "mature"]],
                          ["bodyBuild", "Body build", ["soft and balanced", "species-accurate", "athletic", "powerful and muscular", "small and round"]],
                          ["style", "Style", ["natural", "cartoon", "semi-realistic", "fantasy", "semi-realistic game art"]],
                          ["detailLevel", "Detail", ["low", "medium", "high", "ultra"]],
                          ["pose", "Pose", ["relaxed side view", "natural standing side view", "clear readable side view", "grounded combat-ready side view", "playful standing side view"]],
                          ["expression", "Expression", ["friendly", "calm", "alert", "determined", "curious and cheerful"]],
                        ] as Array<[keyof GuidedAnimalBrief, string, string[]]>).map(([key, label, values]) => (
                          <label key={key} className="text-[8px] font-mono uppercase text-zinc-500">{label}
                            <select disabled={isGenerating || isAutoFillingBrief} value={String(guidedBrief[key])} onChange={(event) => updateBriefField(key, event.target.value as never)} className="mt-1 w-full text-[9px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-300">
                              {values.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5" aria-live="polite">
                        <p className="text-[8px] font-mono uppercase tracking-wide text-amber-400">
                          {selectedDetailDensity.label} target · {selectedDetailTotal} visible SVG shapes total
                        </p>
                        <p className="mt-1 text-[8px] font-mono leading-relaxed text-zinc-400">
                          Head {selectedDetailDensity.targets.head}
                          {" · "}Body {selectedDetailDensity.targets.body}
                          {" · "}Front legs {selectedDetailDensity.targets.frontLegs}
                          {" · "}Back legs {selectedDetailDensity.targets.backLegs}
                          {" · "}Tail {selectedDetailDensity.targets.tail}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {([[
                          "mainColour", "Main colour", "natural species colours"
                        ], ["markings", "Markings", "recognizable species markings"], ["definingAnatomy", "Defining anatomy", "horns, tusks, mane, shell..."], ["advancedInstructions", "Advanced instructions", "Optional extra direction"]] as Array<[keyof GuidedAnimalBrief, string, string]>).map(([key, label, placeholder]) => (
                          <label key={key} className="text-[8px] font-mono uppercase text-zinc-500">{label}
                            <input disabled={isGenerating || isAutoFillingBrief} value={String(guidedBrief[key])} placeholder={placeholder} onChange={(event) => updateBriefField(key, event.target.value as never)} className="mt-1 w-full text-[9px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-300" />
                          </label>
                        ))}
                      </div>
                    </details>
                    <label className="text-[9px] font-mono text-zinc-400 uppercase">Editable expanded brief
                      <textarea disabled={isGenerating || isAutoFillingBrief} rows={3} value={guidedBrief.summary} onChange={(event) => updateBriefField("summary", event.target.value)} className="mt-1 w-full text-[10px] leading-relaxed p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 resize-y" />
                    </label>
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

            {samples && (
              <div className="rounded-2xl border border-amber-500/20 bg-zinc-950/40 p-3">
                <ContactSheetSelector
                  samples={samples}
                  onUse={handleUseSelection}
                  onCancel={() => setSamples(null)}
                  conformanceOf={(slot, index) => conformanceOf(slot as EditablePart, index)}
                  underlays={slotUnderlays}
                  onRefineSlot={(slot, sample, composed, provenance) => {
                    handleUseSelection(composed, provenance);
                    const svg = sample.animal?.[PART_SVG_FIELD[slot]];
                    if (typeof svg === "string") {
                      setActiveTweakPart(slot as EditablePart);
                      runVariationRound(slot as EditablePart, svg, composed);
                    }
                  }}
                />
              </div>
            )}

            {/* Build from already-banked parts — no generation, no spend. */}
            {!samples && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                {showComposer ? (
                  <PartBankComposer onUse={handleUseBankComposition} onCancel={() => setShowComposer(false)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowComposer(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-zinc-300 hover:border-amber-600 hover:text-amber-400"
                  >
                    <Library size={13} /> Build from the part bank
                  </button>
                )}
              </div>
            )}
            {generationStep && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-amber-500/80 bg-amber-500/5 px-3 py-1.5 rounded-lg border border-amber-500/10">
                {isGenerating && <Loader2 size={10} className="animate-spin text-amber-500" />}
                <span>{generationStep}</span>
              </div>
            )}
            {generationMetadata && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <div className="md:col-span-2 text-[10px] leading-relaxed font-mono text-zinc-400 space-y-1.5 rounded-lg border border-zinc-800/80 bg-zinc-950 p-3">
                  <p className="font-bold text-amber-400 uppercase">Pipeline record: {generationMetadata.finalStatus}</p>
                  <p>Model: {generationMetadata.models.generator}</p>
                  {generationMetadata.referenceMode && <p>Reference: {generationMetadata.referenceMode === "match" ? "close match" : "loose inspiration"}</p>}
                  {generationMetadata.plan.referenceAnalysis && (
                    <p className="text-zinc-300">Detected reference: {generationMetadata.plan.referenceAnalysis.pose} · tail {generationMetadata.plan.referenceAnalysis.externalTail}</p>
                  )}
                  <p>Prompts: {Object.values(generationMetadata.promptVersions).join(" · ")}</p>
                  <p>Automatic repairs: {generationMetadata.completedRepairRounds}/{generationMetadata.automaticRepairLimit}</p>
                  <p>Validation runs: {generationMetadata.validationHistory.length} · Reviews: {generationMetadata.reviewHistory.length}</p>
                  {generationMetadata.attemptHistory && (
                    <>
                      <p>Best attempt: {generationMetadata.bestAttempt ?? 0} · Stop: {generationMetadata.stopReason ?? "legacy"} · Rescue: {generationMetadata.rescueUsed ? "used" : "not used"}</p>
                      <ul className="mt-2 space-y-1 break-words text-zinc-300">
                        {generationMetadata.attemptHistory.map((attempt) => (
                          <li key={attempt.attempt} className={attempt.accepted ? "text-emerald-300" : "text-zinc-500"}>
                            Attempt {attempt.attempt} · {attempt.strategy} · {attempt.accepted ? "accepted" : "rejected"}{attempt.scoreDelta !== undefined ? ` · score ${attempt.scoreDelta >= 0 ? "+" : ""}${attempt.scoreDelta}` : ""}: {attempt.reason}
                            {attempt.failedParts.length ? ` Failed: ${attempt.failedParts.join(", ")}.` : ""}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="flex items-center gap-1 pt-1"><span>Final rating:</span>{[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} onClick={() => setGenerationMetadata((current) => current ? { ...current, finalUserRating: rating } : current)} className={`h-5 w-5 rounded border text-[9px] ${generationMetadata.finalUserRating === rating ? "border-amber-400 bg-amber-500 text-zinc-950" : "border-zinc-700 bg-zinc-900"}`}>{rating}</button>)}</div>
                  {(displayedValidation?.issues.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1 break-words text-red-300">
                      {displayedValidation!.issues.map((entry, index) => <li key={`${entry.code}-${index}`}>{entry.part}: {entry.message}</li>)}
                    </ul>
                  )}
                  {displayedReview && <p className="text-zinc-300">Best review: {Object.entries(displayedReview.scores).map(([category, score]) => `${category} ${score}`).join(" · ")}</p>}
                  {(displayedReview?.issues.length ?? 0) > 0 && (
                    <ul className="mt-2 space-y-1 break-words text-amber-300">
                      {displayedReview!.issues.map((entry, index) => <li key={`${entry.id ?? entry.category}-${index}`}>[{entry.severity}] {entry.affectedParts.join(", ") || entry.part}: {entry.description} Correction: {entry.suggestedCorrection}</li>)}
                    </ul>
                  )}
                  {displayedReview?.comparison && <p className="text-zinc-300">Resolved: {displayedReview.comparison.resolvedIssueIds.length} · Persistent: {displayedReview.comparison.persistentIssueIds.length} · New: {displayedReview.comparison.introducedIssueIds.length}</p>}
                  {generationMetadata.metrics && <p>First-pass geometry: {generationMetadata.metrics.firstPassGeometrySuccess ? "pass" : "repair needed"} · {generationMetadata.metrics.latencyMs}ms</p>}
                  {generationMetadata.finalStatus !== "approved" && <p className="text-amber-300">Remaining warnings are visible; use part-only refinement or the SVG editors below.</p>}
                </div>
                {pipelinePreviews && (["cleanSvg", "diagnosticSvg"] as const).map((key) => (
                  <figure key={key} className="rounded-lg border border-zinc-800 overflow-hidden bg-white">
                    <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pipelinePreviews[key])}`} alt={key === "cleanSvg" ? "Clean assembled preview" : "Diagnostic preview with part boundaries and anchors"} className="w-full aspect-[6/5] object-contain" />
                    <figcaption className="bg-zinc-900 px-2 py-1 text-[8px] font-mono uppercase text-zinc-400">{key === "cleanSvg" ? "Clean preview" : "Diagnostic preview"}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>


          {/* Everything read or typed rather than dragged sits below the working
              area, where it does not compete for the same screen space. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mt-6">

            {/* Basic Info & Joints */}
            <div className="space-y-4 font-sans">
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
                        onChange={(e) => handleAnchorChange("neck", { x: parseInt(e.target.value) || 0, y: neckY })}
                        onBlur={() => commitAnchor("neck")}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={neckY}
                        onChange={(e) => handleAnchorChange("neck", { x: neckX, y: parseInt(e.target.value) || 0 })}
                        onBlur={() => commitAnchor("neck")}
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
                        onChange={(e) => handleAnchorChange("tail", { x: parseInt(e.target.value) || 0, y: tailY })}
                        onBlur={() => commitAnchor("tail")}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={tailY}
                        onChange={(e) => handleAnchorChange("tail", { x: tailX, y: parseInt(e.target.value) || 0 })}
                        onBlur={() => commitAnchor("tail")}
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
                        onChange={(e) => handleAnchorChange("frontLegs", { x: parseInt(e.target.value) || 0, y: frontLegsY })}
                        onBlur={() => commitAnchor("frontLegs")}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={frontLegsY}
                        onChange={(e) => handleAnchorChange("frontLegs", { x: frontLegsX, y: parseInt(e.target.value) || 0 })}
                        onBlur={() => commitAnchor("frontLegs")}
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
                        onChange={(e) => handleAnchorChange("backLegs", { x: parseInt(e.target.value) || 0, y: backLegsY })}
                        onBlur={() => commitAnchor("backLegs")}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="X"
                      />
                      <input
                        type="number"
                        value={backLegsY}
                        onChange={(e) => handleAnchorChange("backLegs", { x: backLegsX, y: parseInt(e.target.value) || 0 })}
                        onBlur={() => commitAnchor("backLegs")}
                        className="w-full text-[10px] p-1.5 bg-zinc-900 border border-zinc-800 rounded text-center text-zinc-200"
                        placeholder="Y"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SVG Code Editors */}
            <div className="space-y-4 font-sans">
              <div className="flex items-center justify-between pb-1 border-b border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                  SVG Part Vectors (Pure SVGs)
                </span>
                <span className="text-[9px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                  Use "primary" or "accent"
                </span>
              </div>

              {/*
                Variation settings live here as well as inside the picker: without this the
                first round of a "vary" is stuck on the defaults, because the only controls
                would be the ones that appear alongside its results.
              */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1.5">
                <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">vary settings</span>
                {/*
                  §R1: re-roll and vary both send the reference, so whether one is active has
                  to be visible here — this is far from the upload panel at the top of the AI
                  section, and the feature is invisible otherwise.
                */}
                <ReferenceIndicator
                  active={Boolean(uploadedImage)}
                  loading={referenceLoading}
                  mode={referenceMode}
                />

                <div className="flex items-center gap-0.5">
                  {(Object.keys(VARIATION_STRENGTHS) as VariationStrength[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setVariationStrength(value)}
                      title={VARIATION_STRENGTHS[value].hint}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                        variationStrength === value ? "bg-amber-500 text-zinc-950" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {VARIATION_STRENGTHS[value].label.toLowerCase()}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
                  count
                  <select
                    value={variationCount}
                    onChange={(event) => setVariationCount(Number(event.target.value))}
                    className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[9px] text-zinc-200"
                  >
                    {[2, 4, 6, 8].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <input
                  value={variationInstructions}
                  onChange={(event) => setVariationInstructions(event.target.value)}
                  placeholder={`optional steer, e.g. "rounder ears, softer muzzle"`}
                  className="min-w-[10rem] flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[9px] text-zinc-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {(bankNotice || bankError) && (
                <p className={`rounded-lg border p-2 text-[10px] ${bankError ? "border-amber-900/50 bg-amber-950/20 text-amber-300" : "border-emerald-900/50 bg-emerald-950/20 text-emerald-300"}`}>
                  {bankError || bankNotice}
                </p>
              )}

              <div className="space-y-3 text-xs font-mono">
                {([
                  { part: "head", label: "HEAD COMPONENT", grid: "160x160", value: headSvg, set: setHeadSvg, placeholder: "e.g. <path d='...' fill='primary' />" },
                  { part: "body", label: "BODY COMPONENT", grid: "300x220", value: bodySvg, set: setBodySvg, placeholder: "e.g. <ellipse cx='150' cy='110' rx='100' ry='50' fill='primary' />" },
                  { part: "frontLegs", label: "FRONT LEGS COMPONENT", grid: "260x180", value: frontLegsSvg, set: setFrontLegsSvg, placeholder: "e.g. <path d='...' fill='primary' />" },
                  { part: "backLegs", label: "BACK LEGS COMPONENT", grid: "260x180", value: backLegsSvg, set: setBackLegsSvg, placeholder: "e.g. <path d='...' fill='primary' />" },
                  { part: "tail", label: "TAIL COMPONENT", grid: "160x160", value: tailSvg, set: setTailSvg, placeholder: "e.g. <path d='...' fill='accent' />" },
                ] as const).map((row) => (
                  <div key={row.part} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
                      <span>{row.label} (Ideal grid: {row.grid})</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveSlotToBank(row.part)}
                          disabled={!row.value.trim()}
                          title="Save this part to the bank for reuse"
                          className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-amber-600 hover:text-amber-400 disabled:opacity-40"
                        >
                          <Bookmark size={9} /> save
                        </button>
                        <button
                          type="button"
                          onClick={() => setBankSlot((current) => (current === row.part ? null : row.part))}
                          title="Insert a part from the bank"
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${
                            bankSlot === row.part ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                          }`}
                        >
                          <Library size={9} /> bank
                        </button>
                        <button
                          type="button"
                          onClick={() => setCropSlot((current) => (current === row.part ? null : row.part))}
                          disabled={!uploadedImage}
                          title={uploadedImage
                            ? "Draw the region of the reference this part should be generated from"
                            : "Upload a reference image to crop it to this part"}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] disabled:opacity-40 ${
                            cropSlot === row.part || isMeaningfulCrop(referenceCrops[row.part])
                              ? "border-amber-500 bg-amber-500/10 text-amber-400"
                              : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                          }`}
                        >
                          <Crop size={9} /> crop
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerateSlot(row.part)}
                          disabled={isGenerating || regeneratingSlot !== null || varyingSlot !== null}
                          title="Generate fresh candidates for this part only"
                          className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-amber-600 hover:text-amber-400 disabled:opacity-40"
                        >
                          {regeneratingSlot === row.part ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />} re-roll
                        </button>
                        <button
                          type="button"
                          onClick={() => runVariationRound(row.part, row.value)}
                          disabled={isGenerating || varyingSlot !== null || regeneratingSlot !== null || !row.value.trim()}
                          title="Generate variations based on the part that is here now"
                          className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-amber-600 hover:text-amber-400 disabled:opacity-40"
                        >
                          {varyingSlot === row.part ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />} vary
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={row.value}
                      onChange={(e) => row.set(e.target.value)}
                      placeholder={row.placeholder}
                      className="w-full text-[11px] px-2 py-1.5 bg-zinc-950 border border-zinc-850 rounded-lg text-zinc-300 focus:outline-none focus:border-amber-500 font-mono resize-y"
                    />
                    {bankSlot === row.part && (
                      <PartBankPanel
                        slot={row.part}
                        onInsert={applyBankEntry}
                        insertLabel="Insert"
                        onClose={() => setBankSlot(null)}
                        emptyHint={`No ${row.label.toLowerCase().replace(" component", "")} parts banked yet. Save one with the button above, or bookmark candidates on a contact sheet.`}
                      />
                    )}
                    {cropSlot === row.part && uploadedImage && (
                      <ReferenceCropper
                        slot={row.part}
                        image={uploadedImage}
                        crop={referenceCrops[row.part]}
                        onChange={(crop) => setReferenceCrops((current) => {
                          const next = { ...current };
                          if (crop) next[row.part] = crop; else delete next[row.part];
                          return next;
                        })}
                        onClose={() => setCropSlot(null)}
                      />
                    )}
                    {slotRegen?.slot === row.part && (
                      <SlotCandidatePicker
                        slot={row.part}
                        samples={slotRegen.samples}
                        heading={slotRegen.heading}
                        onPick={(sample) => applySlotSample(row.part, sample)}
                        onCancel={() => setSlotRegen(null)}
                        reference={{ active: Boolean(uploadedImage), loading: referenceLoading, mode: referenceMode }}
                        conformanceOf={isMeaningfulCrop(referenceCrops[row.part]) ? (index) => conformanceOf(row.part, index) : undefined}
                        underlay={slotUnderlays[row.part]}
                        variation={{
                          strength: variationStrength,
                          setStrength: setVariationStrength,
                          instructions: variationInstructions,
                          setInstructions: setVariationInstructions,
                          count: variationCount,
                          setCount: setVariationCount,
                          busy: varyingSlot !== null,
                          onRun: (sample) => {
                            const svg = sample.animal?.[PART_SVG_FIELD[row.part]];
                            if (typeof svg === "string") runVariationRound(row.part, svg);
                          },
                        }}
                      />
                    )}
                  </div>
                ))}
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
