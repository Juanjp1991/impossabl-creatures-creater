import React from "react";
import { PartAdjustment, AnimalPartType } from "../types";
import { Move, Maximize2, RotateCcw } from "lucide-react";
import { getSvgShapes, ShapeTransform } from "../utils/svgParser";

interface AdjustmentControlsProps {
  activePart: AnimalPartType | null;
  adjustment: PartAdjustment;
  onChange: (adjustment: PartAdjustment) => void;
  onResetActive: () => void;
  onResetAll: () => void;
}

export const AdjustmentControls: React.FC<AdjustmentControlsProps> = ({
  activePart,
  adjustment,
  onChange,
  onResetActive,
  onResetAll,
}) => {
  if (!activePart) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 text-center select-none text-zinc-500 font-mono">
        <p className="text-xs uppercase tracking-widest text-zinc-600 mb-1">Part Alignment Controls</p>
        <p className="text-xs">Select a body part to enable translation & scaling tools.</p>
      </div>
    );
  }

  const handleSliderChange = (key: keyof PartAdjustment, value: number) => {
    onChange({
      ...adjustment,
      [key]: value,
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      {/* Whole Part Tuning */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-amber-950/40 flex items-center justify-center border border-amber-900/30">
            <Move size={12} className="text-amber-500" />
          </div>
          <div>
            <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Adjustment Tools</h4>
            <p className="text-[10px] text-zinc-500 font-mono capitalize">Editing: {activePart}</p>
          </div>
        </div>
        <button
          onClick={onResetActive}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] font-mono text-zinc-300 transition-colors"
          title="Reset adjustments for this part only"
        >
          <RotateCcw size={10} />
          Reset Part
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {/* Scale Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
              <Maximize2 size={11} className="text-zinc-500" /> Scale Size
            </span>
            <span className="text-xs font-mono text-amber-500 font-bold bg-zinc-950 px-2 py-0.5 rounded">
              {adjustment.scale.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={adjustment.scale}
            onChange={(e) => handleSliderChange("scale", parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600">
            <span>0.5x (Mini)</span>
            <span>1.0x (Original)</span>
            <span>2.0x (Giant)</span>
          </div>
        </div>

        {/* Offset X Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-400">Horizontal Shift (Offset X)</span>
            <span className="text-xs font-mono text-amber-500 font-bold bg-zinc-950 px-2 py-0.5 rounded">
              {adjustment.offsetX > 0 ? `+${adjustment.offsetX}` : adjustment.offsetX}px
            </span>
          </div>
          <input
            type="range"
            min="-80"
            max="80"
            step="1"
            value={adjustment.offsetX}
            onChange={(e) => handleSliderChange("offsetX", parseInt(e.target.value))}
            className="w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600">
            <span>-80px (Left)</span>
            <span>0px (Center)</span>
            <span>+80px (Right)</span>
          </div>
        </div>

        {/* Offset Y Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-zinc-400">Vertical Shift (Offset Y)</span>
            <span className="text-xs font-mono text-amber-500 font-bold bg-zinc-950 px-2 py-0.5 rounded">
              {adjustment.offsetY > 0 ? `+${adjustment.offsetY}` : adjustment.offsetY}px
            </span>
          </div>
          <input
            type="range"
            min="-80"
            max="80"
            step="1"
            value={adjustment.offsetY}
            onChange={(e) => handleSliderChange("offsetY", parseInt(e.target.value))}
            className="w-full h-1 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex items-center justify-between text-[9px] font-mono text-zinc-600">
            <span>-80px (Up)</span>
            <span>0px (Center)</span>
            <span>+80px (Down)</span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-zinc-800/80 flex justify-end">
        <button
          onClick={onResetAll}
          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <RotateCcw size={10} /> Reset All Skeletons
        </button>
      </div>
    </div>
  );
};
