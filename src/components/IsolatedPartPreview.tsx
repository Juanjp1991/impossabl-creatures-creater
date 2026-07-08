import React from "react";
import { AnimalPart, Animal } from "../types";
import { parseSvgToReact, ShapeTransform } from "../utils/svgParser";

interface IsolatedPartPreviewProps {
  part: AnimalPart | null;
  animal: Animal | null;
  customColor?: string;
  onColorChange?: (color: string) => void;
  shapeTransforms?: Record<number, ShapeTransform>;
}

export const IsolatedPartPreview: React.FC<IsolatedPartPreviewProps> = ({
  part,
  animal,
  customColor,
  onColorChange,
  shapeTransforms,
}) => {
  if (!part || !animal) {
    return (
      <div className="w-full aspect-square bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center text-zinc-500 mb-4 animate-pulse">
          🔍
        </div>
        <p className="text-sm font-medium text-zinc-400">No Part Selected</p>
        <p className="text-xs text-zinc-600 mt-1 max-w-[200px]">
          Click any part on the creature or in the selectors to focus and view isolated code.
        </p>
      </div>
    );
  }

  const baseColor = customColor || animal.color;
  const accentColor = animal.accentColor;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Transparency Checkerboard Preview Stage */}
      <div className="relative w-full aspect-square bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-lg flex items-center justify-center">
        {/* Checkerboard Pattern CSS */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#ffffff 20%, transparent 20%), radial-gradient(#ffffff 20%, transparent 20%)`,
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 12px 12px'
          }}
        />
        <div 
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
          }}
        />

        {/* Outer Bounds Text */}
        <div className="absolute top-2.5 left-3 text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
          Isolated Component
        </div>
        <div className="absolute top-2.5 right-3 text-[9px] font-mono text-amber-500 font-bold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">
          {part.viewBox}
        </div>

        {/* Actual SVG */}
        <svg
          id="isolated-part-svg"
          viewBox={part.viewBox}
          className="w-4/5 h-4/5 object-contain transition-all duration-300 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          {parseSvgToReact(
            part.rawContent,
            { color: baseColor, accentColor },
            animal.color,
            accentColor,
            shapeTransforms
          )}

          {/* Connection point helper inside the isolated preview */}
          {part.connections.neck && (
            <g>
              <circle cx={part.connections.neck.x} cy={part.connections.neck.y} r="6" fill="#ec4899" stroke="#fff" strokeWidth="2" />
              <text x={part.connections.neck.x + 8} y={part.connections.neck.y + 4} fill="#ec4899" className="text-[10px] font-mono font-bold">Neck connection</text>
            </g>
          )}
          {part.connections.body && (
            <g>
              <circle cx={part.connections.body.x} cy={part.connections.body.y} r="6" fill="#3b82f6" stroke="#fff" strokeWidth="2" />
              <text x={part.connections.body.x + 8} y={part.connections.body.y + 4} fill="#3b82f6" className="text-[10px] font-mono font-bold">Body connection</text>
            </g>
          )}
        </svg>

        {/* Bottom Banner */}
        <div className="absolute bottom-2.5 left-3 text-[9px] font-mono text-zinc-600">
          ID: {part.id} | SOURCE: {animal.name}
        </div>
      </div>

      {/* Part Information Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Asset Properties</h4>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono capitalize">
            {part.type}
          </span>
        </div>
        <h3 className="text-sm font-bold text-zinc-100">{part.name}</h3>
        <p className="text-xs text-zinc-400 mt-1">
          Designed for flexible attachment. Anchored at local coordinate{" "}
          <span className="text-amber-400 font-mono">
            {part.connections.neck
              ? `X: ${part.connections.neck.x}, Y: ${part.connections.neck.y}`
              : part.connections.body
              ? `X: ${part.connections.body.x}, Y: ${part.connections.body.y}`
              : "Center"}
          </span>.
        </p>

        {/* Interactive Color Swatch for Asset Tuning */}
        {onColorChange && (
          <div className="mt-4 pt-3 border-t border-zinc-800/80">
            <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-2">
              Color Customizer / Skin Override
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={baseColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
              <div className="flex-1">
                <input
                  type="text"
                  value={baseColor}
                  onChange={(e) => onColorChange(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <button
                onClick={() => onColorChange(animal.color)}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Reset to default animal color"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
