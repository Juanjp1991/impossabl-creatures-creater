import React, { useState, useEffect, useMemo } from "react";
import { ANIMALS } from "./animalsData";
import { CreatureState, AdjustmentsState, AnimalPartType, Animal } from "./types";
import { CreaturePreview } from "./components/CreaturePreview";
import { IsolatedPartPreview } from "./components/IsolatedPartPreview";
import { AdjustmentControls } from "./components/AdjustmentControls";
import { SvgCodeViewer } from "./components/SvgCodeViewer";
import { AnimalLibrary } from "./components/AnimalLibrary";
import { PartSelector } from "./components/PartSelector";
import { parseSvgToReact } from "./utils/svgParser";
import { Eye, HelpCircle, Layers, Settings, Sparkles, Wand2, Info, Heart, Activity } from "lucide-react";

const AnimalPackagePanel = React.lazy(() => import("./components/AnimalPackagePanel").then((module) => ({ default: module.AnimalPackagePanel })));
const AddAnimalDialog = React.lazy(() => import("./components/AddAnimalDialog").then((module) => ({ default: module.AddAnimalDialog })));

const INITIAL_CREATURE: CreatureState = {
  head: "bear",
  body: "bear",
  frontLegs: "bear",
  backLegs: "bear",
  tail: "bear",
};

const INITIAL_ADJUSTMENT = { scale: 1.0, offsetX: 0, offsetY: 0 };

const INITIAL_ADJUSTMENTS: AdjustmentsState = {
  head: { ...INITIAL_ADJUSTMENT },
  body: { ...INITIAL_ADJUSTMENT },
  frontLegs: { ...INITIAL_ADJUSTMENT },
  backLegs: { ...INITIAL_ADJUSTMENT },
  tail: { ...INITIAL_ADJUSTMENT },
  shapeAdjustments: {
    head: {},
    body: {},
    frontLegs: {},
    backLegs: {},
    tail: {},
  },
};

// Initializer helper to read custom templates from localStorage safely and migrate legacy schemas
const getInitialAnimals = (): Animal[] => {
  try {
    const saved = localStorage.getItem("creature_builder_custom_animals");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.map((animal: any) => {
          const bodyConnections = { ...animal.bodyConnections };
          const legacyLegsConn = (bodyConnections as any).legs;

          if (legacyLegsConn && !bodyConnections.frontLegs) {
            bodyConnections.frontLegs = { x: Math.max(20, legacyLegsConn.x - 40), y: legacyLegsConn.y };
          }
          if (legacyLegsConn && !bodyConnections.backLegs) {
            bodyConnections.backLegs = { x: Math.min(280, legacyLegsConn.x + 40), y: legacyLegsConn.y };
          }
          if (!bodyConnections.frontLegs) {
            bodyConnections.frontLegs = { x: 115, y: 160 };
          }
          if (!bodyConnections.backLegs) {
            bodyConnections.backLegs = { x: 235, y: 160 };
          }
          if (!bodyConnections.neck) {
            bodyConnections.neck = { x: 75, y: 90 };
          }
          if (!bodyConnections.tail) {
            bodyConnections.tail = { x: 260, y: 105 };
          }

          const parts = { ...animal.parts };
          const legacyLegsPart = (parts as any).legs;
          if (legacyLegsPart) {
            if (!parts.frontLegs) {
              parts.frontLegs = {
                ...legacyLegsPart,
                id: `${animal.id}-frontLegs`,
                type: "frontLegs",
                name: legacyLegsPart.name.replace("Legs", "Front Legs"),
              };
            }
            if (!parts.backLegs) {
              parts.backLegs = {
                ...legacyLegsPart,
                id: `${animal.id}-backLegs`,
                type: "backLegs",
                name: legacyLegsPart.name.replace("Legs", "Back Legs"),
              };
            }
          }
          if (!parts.frontLegs) {
            parts.frontLegs = {
              id: `${animal.id}-frontLegs`,
              animalId: animal.id,
              type: "frontLegs",
              name: `${animal.name} Front Legs`,
              viewBox: "0 0 260 180",
              connections: { body: { x: 75, y: 15 } },
              rawContent: "",
              render: () => null,
            };
          }
          if (!parts.backLegs) {
            parts.backLegs = {
              id: `${animal.id}-backLegs`,
              animalId: animal.id,
              type: "backLegs",
              name: `${animal.name} Back Legs`,
              viewBox: "0 0 260 180",
              connections: { body: { x: 195, y: 15 } },
              rawContent: "",
              render: () => null,
            };
          }

          return {
            ...animal,
            bodyConnections,
            parts,
          };
        });
        return [...ANIMALS, ...sanitized];
      }
    }
  } catch (err) {
    console.error("Failed to load custom animals from local storage:", err);
  }
  return [...ANIMALS];
};

// Dynamically reconstruct react node render functions for vector elements
const reconstructAnimalRenders = (animals: Animal[]): Animal[] => {
  return animals.map((animal) => {
    if (!animal.id.startsWith("custom-")) {
      return animal;
    }
    return {
      ...animal,
      parts: {
        head: {
          ...animal.parts.head,
          render: (props) =>
            parseSvgToReact(
              animal.parts.head.rawContent,
              props,
              animal.color,
              animal.accentColor
            ),
        },
        body: {
          ...animal.parts.body,
          render: (props) =>
            parseSvgToReact(
              animal.parts.body.rawContent,
              props,
              animal.color,
              animal.accentColor
            ),
        },
        frontLegs: {
          ...animal.parts.frontLegs,
          render: (props) =>
            parseSvgToReact(
              animal.parts.frontLegs.rawContent,
              props,
              animal.color,
              animal.accentColor
            ),
        },
        backLegs: {
          ...animal.parts.backLegs,
          render: (props) =>
            parseSvgToReact(
              animal.parts.backLegs.rawContent,
              props,
              animal.color,
              animal.accentColor
            ),
        },
        tail: {
          ...animal.parts.tail,
          render: (props) =>
            parseSvgToReact(
              animal.parts.tail.rawContent,
              props,
              animal.color,
              animal.accentColor
            ),
        },
      },
    };
  });
};

export default function App() {
  const [animalsListRaw, setAnimalsListRaw] = useState<Animal[]>(getInitialAnimals);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null);

  const handleEditAnimal = (animal: Animal) => {
    setEditingAnimal(animal);
    setIsAddModalOpen(true);
  };

  // Live memoized animals with reconstructed vector renderer methods
  const animalsList = useMemo(() => reconstructAnimalRenders(animalsListRaw), [animalsListRaw]);

  const [creature, setCreature] = useState<CreatureState>(INITIAL_CREATURE);
  const [adjustments, setAdjustments] = useState<AdjustmentsState>(INITIAL_ADJUSTMENTS);
  const [activePart, setActivePart] = useState<AnimalPartType | null>("head");
  const [activeShapeIndex, setActiveShapeIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(true);
  const [animationType, setAnimationType] = useState<string>("breathing");
  const [animationSpeed, setAnimationSpeed] = useState<number>(1);

  const handleSelectPart = (part: AnimalPartType) => {
    setActivePart(part);
    setActiveShapeIndex(null);
  };

  const handleShapeAdjustmentChange = (
    shapeIndex: number,
    key: "translateX" | "translateY" | "rotate" | "scale" | "fill",
    value: any
  ) => {
    if (!activePart) return;
    setAdjustments((prev) => {
      const currentShapeAdjustments = prev.shapeAdjustments || {
        head: {},
        body: {},
        frontLegs: {},
        backLegs: {},
        tail: {},
      };
      const partShapes = { ...currentShapeAdjustments[activePart] };
      const currentShape = partShapes[shapeIndex] || {
        translateX: 0,
        translateY: 0,
        rotate: 0,
        scale: 1,
        fill: undefined,
      };

      partShapes[shapeIndex] = {
        ...currentShape,
        [key]: value,
      };

      return {
        ...prev,
        shapeAdjustments: {
          ...currentShapeAdjustments,
          [activePart]: partShapes,
        },
      };
    });
  };

  const handleResetShapeAdjustment = (shapeIndex: number) => {
    if (!activePart) return;
    setAdjustments((prev) => {
      const currentShapeAdjustments = prev.shapeAdjustments || {
        head: {},
        body: {},
        frontLegs: {},
        backLegs: {},
        tail: {},
      };
      const partShapes = { ...currentShapeAdjustments[activePart] };
      delete partShapes[shapeIndex];

      return {
        ...prev,
        shapeAdjustments: {
          ...currentShapeAdjustments,
          [activePart]: partShapes,
        },
      };
    });
  };
  
  // Custom Color Overrides for individual parts
  const [colorOverrides, setColorOverrides] = useState<{
    head?: string;
    body?: string;
    frontLegs?: string;
    backLegs?: string;
    tail?: string;
  }>({});

  // View helpers
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(false);
  
  // Live SVG code generation states
  const [fullSvgCode, setFullSvgCode] = useState<string>("");
  const [isolatedSvgCode, setIsolatedSvgCode] = useState<string>("");

  // Memoized source lookup
  const activeAnimal = useMemo(() => {
    if (!activePart) return null;
    const sourceAnimalId = creature[activePart];
    return animalsList.find((a) => a.id === sourceAnimalId) || animalsList[0];
  }, [creature, activePart, animalsList]);

  const activePartObj = useMemo(() => {
    if (!activePart || !activeAnimal) return null;
    return activeAnimal.parts[activePart];
  }, [activePart, activeAnimal]);

  // Sync state to actual rendered SVGs for live code preview
  useEffect(() => {
    const timer = setTimeout(() => {
      // 1. Get full creature SVG
      const fullEl = document.getElementById("full-creature-svg");
      if (fullEl) {
        let rawHtml = fullEl.outerHTML;
        // Ensure standard namespace resides inside output
        if (!rawHtml.includes("xmlns=")) {
          rawHtml = rawHtml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        setFullSvgCode(rawHtml);
      }

      // 2. Get isolated part SVG
      const isoEl = document.getElementById("isolated-part-svg");
      if (isoEl) {
        let rawHtml = isoEl.outerHTML;
        if (!rawHtml.includes("xmlns=")) {
          rawHtml = rawHtml.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        setIsolatedCodeState(rawHtml);
      } else {
        setIsolatedCodeState("");
      }
    }, 150); // Small debounce to let React complete layout painting
    return () => clearTimeout(timer);
  }, [creature, adjustments, activePart, colorOverrides]);

  const setIsolatedCodeState = (code: string) => {
    setIsolatedSvgCode(code);
  };

  // Macro Actions
  const handleSelectFull = (animalId: string) => {
    setCreature({
      head: animalId,
      body: animalId,
      frontLegs: animalId,
      backLegs: animalId,
      tail: animalId,
    });
    // Reset individual offsets to defaults
    setAdjustments(JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)));
    setColorOverrides({});
  };

  const handlePartSourceChange = (partType: AnimalPartType, animalId: string) => {
    setCreature((prev) => ({
      ...prev,
      [partType]: animalId,
    }));
  };

  const handleRandomHybrid = () => {
    const randomSource = () => animalsList[Math.floor(Math.random() * animalsList.length)].id;
    
    // Choose random animal source for each part
    setCreature({
      head: randomSource(),
      body: randomSource(),
      frontLegs: randomSource(),
      backLegs: randomSource(),
      tail: randomSource(),
    });

    // Randomize adjustments slightly to create fun, quirky poses
    const randScale = () => parseFloat((0.85 + Math.random() * 0.4).toFixed(2)); // 0.85x to 1.25x
    const randOffset = () => Math.floor(-15 + Math.random() * 30); // -15px to 15px

    setAdjustments({
      head: { scale: randScale(), offsetX: randOffset(), offsetY: randOffset() },
      body: { scale: parseFloat((0.9 + Math.random() * 0.2).toFixed(2)), offsetX: 0, offsetY: 0 },
      frontLegs: { scale: randScale(), offsetX: randOffset(), offsetY: randOffset() },
      backLegs: { scale: randScale(), offsetX: randOffset(), offsetY: randOffset() },
      tail: { scale: randScale(), offsetX: randOffset(), offsetY: randOffset() },
      shapeAdjustments: {
        head: {},
        body: {},
        frontLegs: {},
        backLegs: {},
        tail: {},
      },
    });

    // Clear color overrides to maintain animal base styles
    setColorOverrides({});
  };

  const handleResetAll = () => {
    setCreature(INITIAL_CREATURE);
    setAdjustments(JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)));
    setColorOverrides({});
    setActivePart("head");
    setActiveShapeIndex(null);
  };

  const handleActiveAdjustmentChange = (newAdj: typeof INITIAL_ADJUSTMENT) => {
    if (!activePart) return;
    setAdjustments((prev) => ({
      ...prev,
      [activePart]: newAdj,
    }));
  };

  const handleResetActiveAdjustment = () => {
    if (!activePart) return;
    setAdjustments((prev) => ({
      ...prev,
      [activePart]: { ...INITIAL_ADJUSTMENT },
    }));
  };

  const handleResetAllAdjustments = () => {
    setAdjustments(JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)));
  };

  const handleColorOverrideChange = (color: string) => {
    if (!activePart) return;
    setColorOverrides((prev) => ({
      ...prev,
      [activePart]: color,
    }));
  };

  // Add Dynamic Custom Animal
  const handleAddAnimal = (newAnimal: Animal) => {
    // Nullify render functions so the objects remain purely JSON serializable for storage
    const serializable = {
      ...newAnimal,
      parts: {
        head: { ...newAnimal.parts.head, render: null as any },
        body: { ...newAnimal.parts.body, render: null as any },
        frontLegs: { ...newAnimal.parts.frontLegs, render: null as any },
        backLegs: { ...newAnimal.parts.backLegs, render: null as any },
        tail: { ...newAnimal.parts.tail, render: null as any },
      },
    };

    setAnimalsListRaw((prev) => {
      const customOnly = prev.filter((a) => a.id.startsWith("custom-"));
      const updatedCustomOnly = [...customOnly.filter((animal) => animal.id !== serializable.id), serializable];
      
      try {
        localStorage.setItem("creature_builder_custom_animals", JSON.stringify(updatedCustomOnly));
      } catch (err) {
        console.error("Failed to save custom animal template to local storage:", err);
      }

      return [...ANIMALS, ...updatedCustomOnly];
    });

    // Automatically select the freshly forged custom creature for convenience
    handleSelectFull(newAnimal.id);
  };

  // Delete Dynamic Custom Animal
  const handleDeleteAnimal = (animalId: string) => {
    // Graceful fallback to default 'bear' parts if we are currently equipping parts from this deleted animal
    setCreature((prev) => {
      const copy = { ...prev };
      let changed = false;
      if (copy.head === animalId) { copy.head = "bear"; changed = true; }
      if (copy.body === animalId) { copy.body = "bear"; changed = true; }
      if (copy.frontLegs === animalId) { copy.frontLegs = "bear"; changed = true; }
      if (copy.backLegs === animalId) { copy.backLegs = "bear"; changed = true; }
      if (copy.tail === animalId) { copy.tail = "bear"; changed = true; }
      return changed ? copy : prev;
    });

    setAnimalsListRaw((prev) => {
      const filtered = prev.filter((a) => a.id !== animalId);
      const customOnly = filtered.filter((a) => a.id.startsWith("custom-"));

      try {
        localStorage.setItem("creature_builder_custom_animals", JSON.stringify(customOnly));
      } catch (err) {
        console.error("Failed to update local storage after template deletion:", err);
      }

      return [...ANIMALS, ...customOnly];
    });
  };

  // SVG Exporter utilities
  const handleCopyText = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.warn("Clipboard blocked inside sandbox frame.", err);
    }
  };

  const handleDownloadFile = (filename: string, content: string) => {
    try {
      const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("File download blocked inside iframe sandbox.", err);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#121212] text-zinc-300 font-sans flex flex-col selection:bg-amber-500/30 selection:text-amber-400">
      
      {/* Top Application Ribbon Header */}
      <header className="bg-[#18181b] border-b border-zinc-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-md">
            <Wand2 size={18} className="text-zinc-950" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Creature <span className="text-amber-500">SVG</span> Builder
              <span className="text-xs font-mono font-normal opacity-50 ml-2 uppercase tracking-widest">
                v1.1.0
              </span>
            </h1>
            <p className="text-[11px] text-zinc-500 font-mono leading-tight">
              PROTOTYPE GAME ENGINE MODULAR ASSET COMPILER
            </p>
          </div>
        </div>

        {/* Global Blueprint settings */}
        <div className="flex items-center gap-4 bg-zinc-900/80 p-1 px-3 rounded-lg border border-zinc-800 text-xs">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Canvas Helpers:</span>
          
          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-750 text-amber-500 focus:ring-0 w-3.5 h-3.5 accent-amber-500"
            />
            <span className="font-mono text-[11px]">Show Grid</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors">
            <input
              type="checkbox"
              checked={showSkeleton}
              onChange={(e) => setShowSkeleton(e.target.checked)}
              className="rounded bg-zinc-950 border-zinc-750 text-amber-500 focus:ring-0 w-3.5 h-3.5 accent-amber-500"
            />
            <span className="font-mono text-[11px]">Bone Joint Overlays</span>
          </label>
        </div>
      </header>

      {/* Main Workbench Layout Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: 4 grid spans - Genome templates & Part selectors */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <AnimalLibrary
            animals={animalsList}
            creatureState={creature}
            onSelectFull={handleSelectFull}
            onOpenAddModal={() => {
              setEditingAnimal(null);
              setIsAddModalOpen(true);
            }}
            onDeleteAnimal={handleDeleteAnimal}
            onEditAnimal={handleEditAnimal}
          />

          <React.Suspense fallback={<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-[10px] font-mono text-zinc-500">Loading package compiler…</div>}>
            <AnimalPackagePanel
              animals={animalsList}
              selectedAnimalId={creature.body}
              onImport={handleAddAnimal}
            />
          </React.Suspense>
          
          <PartSelector
            animals={animalsList}
            creatureState={creature}
            activePart={activePart}
            onSelectPart={handleSelectPart}
            onPartSourceChange={handlePartSourceChange}
            onRandomHybrid={handleRandomHybrid}
            onResetAll={handleResetAll}
          />
        </div>

        {/* CENTER COLUMN: 5 grid spans - Full Creature Viewport Arena */}
        <div className="lg:col-span-5 flex flex-col gap-6 h-full justify-start">
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between select-none pb-2 border-b border-zinc-800">
              <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Eye size={12} className="text-amber-500" /> Live Chimeric Render
              </span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase">ASSET SYNCED</span>
              </div>
            </div>

            <CreaturePreview
              creatureState={creature}
              adjustments={adjustments}
              animals={animalsList}
              activePart={activePart}
              onSelectPart={handleSelectPart}
              colorOverrides={colorOverrides}
              showGrid={showGrid}
              showSkeleton={showSkeleton}
              activeShapeIndex={activeShapeIndex}
              isAnimating={isAnimating}
              animationType={animationType}
              animationSpeed={animationSpeed}
            />

            {/* Anim/Life Engine Controller Panel */}
            <div className="bg-[#1e1e24] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between select-none">
                <span className="text-[11px] font-mono font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={13} className="text-amber-500 animate-pulse" /> Live Pulse Engine
                </span>
                <div className="flex items-center gap-1.5">
                  {isAnimating && (
                    <span 
                      className="inline-block animate-[ping_1.2s_ease-in-out_infinite]"
                      style={{ 
                        animationDuration: `${1 / animationSpeed}s` 
                      }}
                    >
                      <Heart size={12} className="text-red-500 fill-red-500" />
                    </span>
                  )}
                  {!isAnimating && <Heart size={12} className="text-zinc-600" />}
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {isAnimating ? `Active (${animationType})` : "Suspended"}
                  </span>
                </div>
              </div>

              {/* Controls Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Switch & Speed Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-zinc-400">Simulation State:</span>
                    <button
                      type="button"
                      onClick={() => setIsAnimating(!isAnimating)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isAnimating ? "bg-amber-500" : "bg-zinc-850"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow ring-0 transition duration-200 ease-in-out ${
                          isAnimating ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                      <span>Metabolism Speed:</span>
                      <span className="text-amber-500 font-bold">{animationSpeed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="2.0"
                      step="0.05"
                      value={animationSpeed}
                      onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                      disabled={!isAnimating}
                      className="w-full accent-amber-500 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Animation Preset Selectors */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-mono text-zinc-400">Biological Rhythm:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "breathing", label: "Calm Breath" },
                      { id: "playful", label: "Playful Wag" },
                      { id: "vigilant", label: "Vigilant Alert" },
                      { id: "fluid", label: "Aquatic Fluid" },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setAnimationType(preset.id)}
                        disabled={!isAnimating}
                        className={`px-2 py-1.5 text-[10px] font-mono rounded border text-left transition-all ${
                          !isAnimating 
                            ? "border-zinc-800/40 bg-zinc-950/20 text-zinc-600 cursor-not-allowed" 
                            : animationType === preset.id
                              ? "border-amber-500/50 bg-amber-500/10 text-amber-400 font-bold shadow-sm"
                              : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick manual tips */}
            <div className="flex gap-2 p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/40">
              <Info size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-zinc-400 leading-normal">
                <span className="text-amber-500 font-bold">Chimeric Joint Binding:</span> The head pivots on the neck, legs pivot on the pelvic/chest hips, and the tail pivots on the rump. Adjust sizing dynamically in the panel.
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 grid spans - Focus component isolated view & custom offsets */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <IsolatedPartPreview
            part={activePartObj}
            animal={activeAnimal}
            customColor={activePart ? colorOverrides[activePart] : undefined}
            onColorChange={handleColorOverrideChange}
          />

          <AdjustmentControls
            activePart={activePart}
            adjustment={activePart ? adjustments[activePart] : INITIAL_ADJUSTMENT}
            onChange={handleActiveAdjustmentChange}
            onResetActive={handleResetActiveAdjustment}
            onResetAll={handleResetAllAdjustments}
          />
        </div>

        {/* BOTTOM AREA (Full Width in column flow): Code output panel */}
        <div className="lg:col-span-12">
          <SvgCodeViewer
            fullSvgCode={fullSvgCode}
            isolatedSvgCode={isolatedSvgCode}
            activePartName={activePartObj ? activePartObj.name : null}
            onDownloadFull={() =>
              handleDownloadFile(
                `creature-hybrid-${creature.head}-${creature.body}-${creature.frontLegs}-${creature.backLegs}-${creature.tail}.svg`,
                fullSvgCode
              )
            }
            onDownloadIsolated={() => {
              if (activePartObj) {
                handleDownloadFile(`part-${activePartObj.id}.svg`, isolatedSvgCode);
              }
            }}
            onCopyFull={() => handleCopyText(fullSvgCode)}
            onCopyIsolated={() => handleCopyText(isolatedSvgCode)}
          />
        </div>
      </main>

      {/* Dynamic Creation Dialog Modal Overlay */}
      {isAddModalOpen && <React.Suspense fallback={null}><AddAnimalDialog
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingAnimal(null);
        }}
        onAddAnimal={(newAnimal) => {
          if (editingAnimal) {
            setAnimalsListRaw((prev) => {
              const filtered = prev.filter((a) => a.id !== editingAnimal.id);
              const serializable = {
                ...newAnimal,
                parts: {
                  head: { ...newAnimal.parts.head, render: null as any },
                  body: { ...newAnimal.parts.body, render: null as any },
                  frontLegs: { ...newAnimal.parts.frontLegs, render: null as any },
                  backLegs: { ...newAnimal.parts.backLegs, render: null as any },
                  tail: { ...newAnimal.parts.tail, render: null as any },
                },
              };
              const updatedCustomOnly = [...filtered.filter((a) => a.id.startsWith("custom-")), serializable];
              try {
                localStorage.setItem("creature_builder_custom_animals", JSON.stringify(updatedCustomOnly));
              } catch (err) {
                console.error("Failed to save custom animal template update to local storage:", err);
              }
              return [...ANIMALS, ...updatedCustomOnly];
            });
            handleSelectFull(newAnimal.id);
          } else {
            handleAddAnimal(newAnimal);
          }
          setEditingAnimal(null);
        }}
        editingAnimal={editingAnimal}
      /></React.Suspense>}

      {/* Footer info brand */}
      <footer className="mt-auto py-5 border-t border-zinc-800 text-center text-[11px] font-mono text-zinc-500 bg-[#18181b] select-none flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">Asset ID</span>
          <span className="text-[10px] font-mono text-amber-500">CREATURE-HYB-442-99</span>
        </div>
        <p>© 2026 CREATURE SVG BUILDER • BUILT SECURELY WITH PURE PROGRAMMABLE VECTOR SVGS</p>
        <div className="text-[10px] text-zinc-500">Memory: ~12KB</div>
      </footer>
    </div>
  );
}
