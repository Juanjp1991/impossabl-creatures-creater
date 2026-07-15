import React, { useMemo } from "react";
import { Animal, CreatureState, AdjustmentsState, AnimalPartType } from "../types";
import { parseSvgToReact } from "../utils/svgParser";
import { motion } from "motion/react";

interface CreaturePreviewProps {
  creatureState: CreatureState;
  adjustments: AdjustmentsState;
  animals: Animal[];
  activePart: AnimalPartType | null;
  onSelectPart: (part: AnimalPartType) => void;
  colorOverrides: {
    head?: string;
    body?: string;
    frontLegs?: string;
    backLegs?: string;
    tail?: string;
  };
  showGrid: boolean;
  showSkeleton: boolean;
  customGroundColor?: string;
  activeShapeIndex?: number | null;
  isAnimating?: boolean;
  animationType?: string;
  animationSpeed?: number;
}

export const CreaturePreview: React.FC<CreaturePreviewProps> = ({
  creatureState,
  adjustments,
  animals,
  activePart,
  onSelectPart,
  colorOverrides,
  showGrid,
  showSkeleton,
  customGroundColor = "#1e1e2e",
  activeShapeIndex = null,
  isAnimating = true,
  animationType = "breathing",
  animationSpeed = 1,
}) => {
  // Find the source animal for each part
  const headAnimal = useMemo(() => animals.find(a => a.id === creatureState.head) || animals[0], [animals, creatureState.head]);
  const bodyAnimal = useMemo(() => animals.find(a => a.id === creatureState.body) || animals[0], [animals, creatureState.body]);
  const frontLegsAnimal = useMemo(() => animals.find(a => a.id === creatureState.frontLegs) || animals[0], [animals, creatureState.frontLegs]);
  const backLegsAnimal = useMemo(() => animals.find(a => a.id === creatureState.backLegs) || animals[0], [animals, creatureState.backLegs]);
  const tailAnimal = useMemo(() => animals.find(a => a.id === creatureState.tail) || animals[0], [animals, creatureState.tail]);

  const headPart = headAnimal.parts.head;
  const bodyPart = bodyAnimal.parts.body;
  const frontLegsPart = frontLegsAnimal.parts.frontLegs;
  const backLegsPart = backLegsAnimal.parts.backLegs;
  const tailPart = tailAnimal.parts.tail;

  // Base translation of the body in our 600x500 combined viewport
  const bodyTranslate = { x: 150, y: 150 };

  // Adjustments
  const headAdjust = adjustments.head;
  const bodyAdjust = adjustments.body;
  const frontLegsAdjust = adjustments.frontLegs;
  const backLegsAdjust = adjustments.backLegs;
  const tailAdjust = adjustments.tail;

  // Body connection targets in combined coordinate space
  // We apply the body's scale and offset to its own points
  const bScale = bodyAdjust.scale;
  
  // To scale the body and still connect other parts correctly, we need to know where
  // the body connection points end up after applying its scale around its own center.
  // Center of the body is approximately (150, 110) in its 300x220 space.
  const bodyCenter = { x: 150, y: 110 };

  const getScaledBodyPoint = (point?: { x: number; y: number }) => {
    if (!point) return { x: 150, y: 110 };
    // 1. Scale relative to body center
    const rx = bodyCenter.x + (point.x - bodyCenter.x) * bScale;
    const ry = bodyCenter.y + (point.y - bodyCenter.y) * bScale;
    // 2. Apply body translate and offset
    return {
      x: bodyTranslate.x + rx + bodyAdjust.offsetX,
      y: bodyTranslate.y + ry + bodyAdjust.offsetY,
    };
  };

  const neckTarget = getScaledBodyPoint(bodyAnimal?.bodyConnections?.neck);
  const tailTarget = getScaledBodyPoint(bodyAnimal?.bodyConnections?.tail);
  const frontLegsTarget = getScaledBodyPoint(bodyAnimal?.bodyConnections?.frontLegs);
  const backLegsTarget = getScaledBodyPoint(bodyAnimal?.bodyConnections?.backLegs);

  // Helper to compute rendering colors
  const headColor = colorOverrides.head || headAnimal.color;
  const bodyColor = colorOverrides.body || bodyAnimal.color;
  const frontLegsColor = colorOverrides.frontLegs || frontLegsAnimal.color;
  const backLegsColor = colorOverrides.backLegs || backLegsAnimal.color;
  const tailColor = colorOverrides.tail || tailAnimal.color;

  // Compute final translations for the parts based on skeletal alignment
  // 1. Head: align head's neck connection point with the body's neck target
  const headLocalNeck = headPart.connections.neck || { x: 0, y: 0 };
  const headTranslate = {
    x: neckTarget.x - headLocalNeck.x + headAdjust.offsetX,
    y: neckTarget.y - headLocalNeck.y + headAdjust.offsetY
  };

  // 2. Tail: align tail's body connection point with the body's tail target
  const tailLocalBody = tailPart.connections.body || { x: 0, y: 0 };
  const tailTranslate = {
    x: tailTarget.x - tailLocalBody.x + tailAdjust.offsetX,
    y: tailTarget.y - tailLocalBody.y + tailAdjust.offsetY
  };

  // 3. Front Legs: align front legs' body connection point with the body's frontLegs target
  const frontLegsLocalBody = frontLegsPart.connections.body || { x: 0, y: 0 };
  const frontLegsTranslate = {
    x: frontLegsTarget.x - frontLegsLocalBody.x + frontLegsAdjust.offsetX,
    y: frontLegsTarget.y - frontLegsLocalBody.y + frontLegsAdjust.offsetY
  };

  // 4. Back Legs: align back legs' body connection point with the body's backLegs target
  const backLegsLocalBody = backLegsPart.connections.body || { x: 0, y: 0 };
  const backLegsTranslate = {
    x: backLegsTarget.x - backLegsLocalBody.x + backLegsAdjust.offsetX,
    y: backLegsTarget.y - backLegsLocalBody.y + backLegsAdjust.offsetY
  };

  // Sub-shape specific adjustments
  const shapeAdjustments = adjustments.shapeAdjustments;
  const headShapeTransforms = shapeAdjustments?.head;
  const bodyShapeTransforms = shapeAdjustments?.body;
  const frontLegsShapeTransforms = shapeAdjustments?.frontLegs;
  const backLegsShapeTransforms = shapeAdjustments?.backLegs;
  const tailShapeTransforms = shapeAdjustments?.tail;

  const headHighlight = activePart === "head" ? (activeShapeIndex !== null ? activeShapeIndex : undefined) : undefined;
  const bodyHighlight = activePart === "body" ? (activeShapeIndex !== null ? activeShapeIndex : undefined) : undefined;
  const frontLegsHighlight = activePart === "frontLegs" ? (activeShapeIndex !== null ? activeShapeIndex : undefined) : undefined;
  const backLegsHighlight = activePart === "backLegs" ? (activeShapeIndex !== null ? activeShapeIndex : undefined) : undefined;
  const tailHighlight = activePart === "tail" ? (activeShapeIndex !== null ? activeShapeIndex : undefined) : undefined;

  const currentPreset = useMemo(() => {
    const speedMultiplier = 1 / animationSpeed;
    const presets: Record<string, any> = {
      breathing: {
        body: {
          scaleY: [1, 1.015, 1],
          scaleX: [1, 1.006, 1],
          y: [0, -1, 0],
          transition: { duration: 4 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        head: {
          y: [0, -1.5, 0],
          rotate: [-1, 1, -1],
          transition: { duration: 4 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.3 }
        },
        tail: {
          rotate: [-3, 3, -3],
          transition: { duration: 3.2 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        frontLegs: {
          scaleY: [1, 0.99, 1],
          y: [0, 0.5, 0],
          transition: { duration: 4 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.1 }
        },
        backLegs: {
          scaleY: [1, 0.985, 1],
          y: [0, 0.4, 0],
          transition: { duration: 4 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.25 }
        }
      },
      playful: {
        body: {
          scaleY: [1, 1.025, 1],
          scaleX: [1, 1.015, 1],
          y: [0, -3, 0],
          transition: { duration: 2.2 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        head: {
          y: [0, -3.5, 0],
          rotate: [-3, 3, -3],
          transition: { duration: 2.2 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.1 }
        },
        tail: {
          rotate: [-14, 15, -14],
          transition: { duration: 1.1 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        frontLegs: {
          scaleY: [1, 0.98, 1],
          y: [0, 1.2, 0],
          transition: { duration: 2.2 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0 }
        },
        backLegs: {
          scaleY: [1, 0.975, 1],
          y: [0, 1.0, 0],
          transition: { duration: 2.2 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.15 }
        }
      },
      vigilant: {
        body: {
          scaleY: [1, 1.006, 1],
          y: [0, -0.4, 0],
          transition: { duration: 6 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        head: {
          y: [0, -0.8, 0],
          rotate: [-0.5, 0.8, -0.5],
          transition: { duration: 5 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.8 }
        },
        tail: {
          rotate: [-1.5, 1.5, -1.5],
          transition: { duration: 7 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        frontLegs: {
          y: [0, 0.1, 0],
          transition: { duration: 6 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0 }
        },
        backLegs: {
          y: [0, 0.08, 0],
          transition: { duration: 6 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.3 }
        }
      },
      fluid: {
        body: {
          y: [-1.5, 1.5, -1.5],
          rotate: [-0.8, 0.8, -0.8],
          transition: { duration: 3.5 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        head: {
          y: [-1, 1.5, -1],
          rotate: [-2, 2, -2],
          transition: { duration: 3.5 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.5 }
        },
        tail: {
          rotate: [-11, 11, -11],
          y: [1.5, -1.5, 1.5],
          transition: { duration: 2.8 * speedMultiplier, ease: "easeInOut", repeat: Infinity }
        },
        frontLegs: {
          y: [-0.4, 0.4, -0.4],
          transition: { duration: 3.5 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.2 }
        },
        backLegs: {
          y: [-0.3, 0.3, -0.3],
          transition: { duration: 3.5 * speedMultiplier, ease: "easeInOut", repeat: Infinity, delay: 0.4 }
        }
      }
    };
    return presets[animationType] || presets.breathing;
  }, [animationType, animationSpeed]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* Visual Canvas Panel */}
      <div className="relative w-full aspect-[4/3] max-h-[480px] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden group select-none">
        
        {/* Canvas Background Grid */}
        {showGrid && (
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-50" />
        )}
        {showGrid && (
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#37415125_5px,transparent_5px),linear-gradient(to_bottom,#37415125_5px,transparent_5px)] bg-[size:100px_100px] pointer-events-none opacity-70" />
        )}

        {/* Blueprint Style Accent Borders */}
        <div className="absolute top-3 left-4 text-[10px] font-mono text-zinc-500 pointer-events-none flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          CREATURE CANVAS | 600 × 500 PX
        </div>
        
        <div className="absolute bottom-3 left-4 text-[10px] font-mono text-zinc-500 pointer-events-none">
          ACTIVE SELECTION: <span className="text-amber-500 uppercase font-bold">{activePart || "None"}</span>
        </div>

        {/* Outer scale / viewport info */}
        <div className="absolute top-3 right-4 text-[10px] font-mono text-zinc-500 pointer-events-none flex gap-3">
          <span>H: {headAnimal.name}</span>
          <span>B: {bodyAnimal.name}</span>
          <span>FL: {frontLegsAnimal.name}</span>
          <span>BL: {backLegsAnimal.name}</span>
          <span>T: {tailAnimal.name}</span>
        </div>

        {/* Ground Line visual */}
        <div className="absolute bottom-[80px] left-0 right-0 h-[2px] bg-zinc-800 opacity-60 pointer-events-none flex items-center justify-center">
          <span className="text-[9px] font-mono text-zinc-600 bg-zinc-950 px-2 uppercase tracking-widest translate-y-[10px]">
            Alignment Baseline
          </span>
        </div>

        {/* Shadow floor under the creature */}
        <div 
          className="absolute bottom-[82px] left-[50%] translate-x-[-50%] w-[320px] h-[24px] rounded-full blur-md opacity-40 pointer-events-none transition-all duration-300"
          style={{
            backgroundColor: "#000",
            transform: `translateX(-50%) scale(${bodyAdjust.scale * 1.1})`
          }}
        />

        {/* The SVG Container */}
        <svg
          id="full-creature-svg"
          viewBox="0 0 600 500"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Defs block to hold all gradient specifications */}
          <defs>
            {/* Checkerboard/grid pattern for standalone SVG export if needed */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#222" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* TAIL LAYER (Behind body) */}
          <g 
            className="cursor-pointer transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart("tail");
            }}
          >
            {/* Tail group placement */}
            <g transform={`translate(${tailTarget.x + tailAdjust.offsetX}, ${tailTarget.y + tailAdjust.offsetY})`}>
              <motion.g
                animate={isAnimating ? currentPreset.tail : { rotate: 0, y: 0 }}
                style={{ transformOrigin: "0px 0px" }}
              >
                <g transform={`scale(${tailAdjust.scale}) translate(${-tailLocalBody.x}, ${-tailLocalBody.y})`}>
                  {parseSvgToReact(
                    tailPart.rawContent,
                    { color: tailColor, accentColor: tailAnimal.accentColor },
                    tailAnimal.color,
                    tailAnimal.accentColor,
                    tailShapeTransforms,
                    tailHighlight
                  )}
                </g>
              </motion.g>
            </g>
            {/* Selected Outline */}
            {activePart === "tail" && (
              <rect
                x={tailTranslate.x - 5}
                y={tailTranslate.y - 5}
                width={80 * tailAdjust.scale}
                height={80 * tailAdjust.scale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
                className="animate-[spin_40s_linear_infinite]"
              />
            )}
          </g>

          {/* BACK LEGS LAYER (Renders behind body for 3D depth) */}
          <g 
            className="cursor-pointer transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart("backLegs");
            }}
          >
            {/* Back Legs placement */}
            <g transform={`translate(${backLegsTarget.x + backLegsAdjust.offsetX}, ${backLegsTarget.y + backLegsAdjust.offsetY})`}>
              <motion.g
                animate={isAnimating ? currentPreset.backLegs : { scaleY: 1, y: 0 }}
                style={{ transformOrigin: "0px 0px" }}
              >
                <g transform={`scale(${backLegsAdjust.scale}) translate(${-backLegsLocalBody.x}, ${-backLegsLocalBody.y})`}>
                  {parseSvgToReact(
                    backLegsPart.rawContent,
                    { color: backLegsColor, accentColor: backLegsAnimal.accentColor },
                    backLegsAnimal.color,
                    backLegsAnimal.accentColor,
                    backLegsShapeTransforms,
                    backLegsHighlight
                  )}
                </g>
              </motion.g>
            </g>
            {/* Selected Outline */}
            {activePart === "backLegs" && (
              <rect
                x={backLegsTranslate.x - 5}
                y={backLegsTranslate.y - 5}
                width={120 * backLegsAdjust.scale}
                height={160 * backLegsAdjust.scale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </g>

          {/* BODY LAYER */}
          <g 
            className="cursor-pointer transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart("body");
            }}
          >
            {/* Body placement */}
            <g transform={`translate(${bodyTranslate.x + bodyAdjust.offsetX + bodyCenter.x}, ${bodyTranslate.y + bodyAdjust.offsetY + bodyCenter.y})`}>
              <motion.g
                animate={isAnimating ? currentPreset.body : { scaleY: 1, scaleX: 1, y: 0 }}
                style={{ transformOrigin: "0px 0px" }}
              >
                <g transform={`scale(${bScale}) translate(${-bodyCenter.x}, ${-bodyCenter.y})`}>
                  {parseSvgToReact(
                    bodyPart.rawContent,
                    { color: bodyColor, accentColor: bodyAnimal.accentColor },
                    bodyAnimal.color,
                    bodyAnimal.accentColor,
                    bodyShapeTransforms,
                    bodyHighlight
                  )}
                </g>
              </motion.g>
            </g>
            {/* Selected Outline */}
            {activePart === "body" && (
              <rect
                x={bodyTranslate.x + bodyAdjust.offsetX - 5}
                y={bodyTranslate.y + bodyAdjust.offsetY - 5}
                width={300 * bScale}
                height={220 * bScale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </g>

          {/* FRONT LEGS LAYER (Renders in front of body) */}
          <g 
            className="cursor-pointer transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart("frontLegs");
            }}
          >
            {/* Front Legs placement */}
            <g transform={`translate(${frontLegsTarget.x + frontLegsAdjust.offsetX}, ${frontLegsTarget.y + frontLegsAdjust.offsetY})`}>
              <motion.g
                animate={isAnimating ? currentPreset.frontLegs : { scaleY: 1, y: 0 }}
                style={{ transformOrigin: "0px 0px" }}
              >
                <g transform={`scale(${frontLegsAdjust.scale}) translate(${-frontLegsLocalBody.x}, ${-frontLegsLocalBody.y})`}>
                  {parseSvgToReact(
                    frontLegsPart.rawContent,
                    { color: frontLegsColor, accentColor: frontLegsAnimal.accentColor },
                    frontLegsAnimal.color,
                    frontLegsAnimal.accentColor,
                    frontLegsShapeTransforms,
                    frontLegsHighlight
                  )}
                </g>
              </motion.g>
            </g>
            {/* Selected Outline */}
            {activePart === "frontLegs" && (
              <rect
                x={frontLegsTranslate.x - 5}
                y={frontLegsTranslate.y - 5}
                width={120 * frontLegsAdjust.scale}
                height={160 * frontLegsAdjust.scale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </g>

          {/* HEAD LAYER (In front of body and legs) */}
          <g 
            className="cursor-pointer transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              onSelectPart("head");
            }}
          >
            {/* Head placement */}
            <g transform={`translate(${neckTarget.x + headAdjust.offsetX}, ${neckTarget.y + headAdjust.offsetY})`}>
              <motion.g
                animate={isAnimating ? currentPreset.head : { rotate: 0, y: 0 }}
                style={{ transformOrigin: "0px 0px" }}
              >
                <g transform={`scale(${headAdjust.scale}) translate(${-headLocalNeck.x}, ${-headLocalNeck.y})`}>
                  {parseSvgToReact(
                    headPart.rawContent,
                    { color: headColor, accentColor: headAnimal.accentColor },
                    headAnimal.color,
                    headAnimal.accentColor,
                    headShapeTransforms,
                    headHighlight
                  )}
                </g>
              </motion.g>
            </g>
            {/* Selected Outline */}
            {activePart === "head" && (
              <rect
                x={headTranslate.x - 5}
                y={headTranslate.y - 5}
                width={130 * headAdjust.scale}
                height={130 * headAdjust.scale}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
            )}
          </g>

          {/* SKELETON LAYER (Bone connection guide lines) */}
          {showSkeleton && (
            <g opacity="0.85" pointerEvents="none">
              {/* Joint Dots */}
              {/* 1. Neck Connection */}
              <line 
                x1={neckTarget.x} 
                y1={neckTarget.y} 
                x2={headTranslate.x + headLocalNeck.x} 
                y2={headTranslate.y + headLocalNeck.y} 
                stroke="#ec4899" 
                strokeWidth="2" 
                strokeDasharray="2,2" 
              />
              <circle cx={neckTarget.x} cy={neckTarget.y} r="5" fill="#ec4899" />
              <circle cx={headTranslate.x + headLocalNeck.x} cy={headTranslate.y + headLocalNeck.y} r="3" fill="#ffffff" />
              <text x={neckTarget.x + 8} y={neckTarget.y - 4} fill="#ec4899" className="text-[9px] font-mono font-bold select-none">neck joint</text>

              {/* 2. Tail Connection */}
              <line 
                x1={tailTarget.x} 
                y1={tailTarget.y} 
                x2={tailTranslate.x + tailLocalBody.x} 
                y2={tailTranslate.y + tailLocalBody.y} 
                stroke="#3b82f6" 
                strokeWidth="2" 
                strokeDasharray="2,2" 
              />
              <circle cx={tailTarget.x} cy={tailTarget.y} r="5" fill="#3b82f6" />
              <circle cx={tailTranslate.x + tailLocalBody.x} cy={tailTranslate.y + tailLocalBody.y} r="3" fill="#ffffff" />
              <text x={tailTarget.x + 8} y={tailTarget.y - 4} fill="#3b82f6" className="text-[9px] font-mono font-bold select-none">tail joint</text>

              {/* 3. Front Legs Connection */}
              <line 
                x1={frontLegsTarget.x} 
                y1={frontLegsTarget.y} 
                x2={frontLegsTranslate.x + frontLegsLocalBody.x} 
                y2={frontLegsTranslate.y + frontLegsLocalBody.y} 
                stroke="#f59e0b" 
                strokeWidth="2" 
                strokeDasharray="2,2" 
              />
              <circle cx={frontLegsTarget.x} cy={frontLegsTarget.y} r="5" fill="#f59e0b" />
              <circle cx={frontLegsTranslate.x + frontLegsLocalBody.x} cy={frontLegsTranslate.y + frontLegsLocalBody.y} r="3" fill="#ffffff" />
              <text x={frontLegsTarget.x + 8} y={frontLegsTarget.y - 4} fill="#f59e0b" className="text-[9px] font-mono font-bold select-none">front shoulder</text>

              {/* 4. Back Legs Connection */}
              <line 
                x1={backLegsTarget.x} 
                y1={backLegsTarget.y} 
                x2={backLegsTranslate.x + backLegsLocalBody.x} 
                y2={backLegsTranslate.y + backLegsLocalBody.y} 
                stroke="#10b981" 
                strokeWidth="2" 
                strokeDasharray="2,2" 
              />
              <circle cx={backLegsTarget.x} cy={backLegsTarget.y} r="5" fill="#10b981" />
              <circle cx={backLegsTranslate.x + backLegsLocalBody.x} cy={backLegsTranslate.y + backLegsLocalBody.y} r="3" fill="#ffffff" />
              <text x={backLegsTarget.x + 8} y={backLegsTarget.y - 4} fill="#10b981" className="text-[9px] font-mono font-bold select-none">rear hip</text>

              {/* Spine connection bone (neck to hip to tail) */}
              <path 
                d={`M ${neckTarget.x} ${neckTarget.y} Q ${(neckTarget.x + tailTarget.x)/2} ${(neckTarget.y + tailTarget.y)/2 - 30} ${tailTarget.x} ${tailTarget.y}`} 
                fill="none" 
                stroke="#a855f7" 
                strokeWidth="1.5" 
                opacity="0.6" 
              />
              <path 
                d={`M ${(neckTarget.x + frontLegsTarget.x)/2} ${(neckTarget.y + frontLegsTarget.y)/2} L ${frontLegsTarget.x} ${frontLegsTarget.y}`} 
                fill="none" 
                stroke="#a855f7" 
                strokeWidth="1.5" 
                opacity="0.6" 
              />
              <path 
                d={`M ${(tailTarget.x + backLegsTarget.x)/2} ${(tailTarget.y + backLegsTarget.y)/2} L ${backLegsTarget.x} ${backLegsTarget.y}`} 
                fill="none" 
                stroke="#a855f7" 
                strokeWidth="1.5" 
                opacity="0.6" 
              />
            </g>
          )}
        </svg>

        {/* Hover/Tap Hint Overlay */}
        <div className="absolute top-3 left-[50%] translate-x-[-50%] bg-zinc-900/80 backdrop-blur-md px-3 py-1 rounded-full border border-zinc-800 text-[10px] text-zinc-400 select-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1.5 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          CLICK ANY PART TO ADJUST & FOCUS
        </div>
      </div>
    </div>
  );
};
