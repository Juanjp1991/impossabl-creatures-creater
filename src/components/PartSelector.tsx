import React from "react";
import { Animal, CreatureState, AnimalPartType } from "../types";
import { Layers, Shuffle, RotateCcw } from "lucide-react";

interface PartSelectorProps {
  animals: Animal[];
  creatureState: CreatureState;
  activePart: AnimalPartType | null;
  onSelectPart: (part: AnimalPartType) => void;
  onPartSourceChange: (partType: AnimalPartType, animalId: string) => void;
  onRandomHybrid: () => void;
  onResetAll: () => void;
}

export const PartSelector: React.FC<PartSelectorProps> = ({
  animals,
  creatureState,
  activePart,
  onSelectPart,
  onPartSourceChange,
  onRandomHybrid,
  onResetAll,
}) => {
  const partTypes: { type: AnimalPartType; label: string; desc: string }[] = [
    { type: "head", label: "Head Source", desc: "Senses, face markings, and ears" },
    { type: "body", label: "Body Torso", desc: "Mass, core proportions, and back shape" },
    { type: "frontLegs", label: "Front Legs", desc: "Front posture, forepaws, and shoulders" },
    { type: "backLegs", label: "Back Legs", desc: "Rear posture, hindpaws, and hip structure" },
    { type: "tail", label: "Tail Component", desc: "Balance, length, and detail markings" },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col gap-5">
      {/* Header and Macro Actions */}
      <div className="flex flex-col gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-amber-500" />
            <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
              Chimeric Part Assembler
            </h3>
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Mix and match parts from different species. Click the slot headers or focus buttons to edit scaling/translation offsets.
        </p>

        {/* Global Control Buttons */}
        <div className="flex gap-2 mt-1">
          <button
            onClick={onRandomHybrid}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 text-xs font-mono font-bold rounded-lg shadow-md transition-all"
          >
            <Shuffle size={13} />
            Random Hybrid
          </button>
          <button
            onClick={onResetAll}
            className="flex items-center justify-center gap-1.5 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 text-xs font-mono rounded-lg border border-zinc-700/50 transition-all"
            title="Reset parts and adjustments to Bear defaults"
          >
            <RotateCcw size={13} />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Part Selection Sections */}
      <div className="flex flex-col gap-4">
        {partTypes.map(({ type, label, desc }) => {
          const activeSourceId = creatureState[type];
          const activeAnimal = animals.find((a) => a.id === activeSourceId) || animals[0];
          const isFocused = activePart === type;

          return (
            <div
              key={type}
              className={`bg-zinc-950/40 border rounded-xl p-3.5 transition-all duration-200 ${
                isFocused
                  ? "border-amber-500/50 bg-zinc-950/80 shadow-[0_0_8px_rgba(245,158,11,0.05)]"
                  : "border-zinc-850 hover:border-zinc-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div 
                  className="cursor-pointer"
                  onClick={() => onSelectPart(type)}
                >
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-zinc-300 flex items-center gap-1.5 hover:text-amber-500 transition-colors">
                    {label}
                    {isFocused && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                    )}
                  </span>
                  <p className="text-[10px] text-zinc-500 font-sans mt-0.5">{desc}</p>
                </div>
                
                <button
                  onClick={() => onSelectPart(type)}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded transition-all ${
                    isFocused
                      ? "bg-amber-950/40 text-amber-400 border border-amber-900/30"
                      : "bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {isFocused ? "FOCUSED" : "FOCUS TOOL"}
                </button>
              </div>

              {/* Toggles for choosing the animal supplier */}
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                {animals.map((animal) => {
                  const isSelected = activeSourceId === animal.id;
                  return (
                    <button
                      key={animal.id}
                      onClick={() => {
                        onPartSourceChange(type, animal.id);
                        // Also auto-select the part for editing
                        onSelectPart(type);
                      }}
                      className={`relative py-2 px-3 rounded-lg flex items-center justify-between gap-1.5 text-xs font-mono border text-left transition-all active:scale-95 ${
                        isSelected
                          ? "bg-zinc-900 text-amber-500 font-bold border-zinc-700 shadow-sm"
                          : "bg-zinc-950/60 hover:bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:border-zinc-800"
                      }`}
                    >
                      <span className="truncate">{animal.name.split(" ").pop()}</span>
                      
                      {/* Selection bullet/color indicator */}
                      <span
                        className={`w-2 h-2 rounded-full border flex-shrink-0 transition-transform ${
                          isSelected ? "scale-110 border-white shadow" : "border-zinc-700"
                        }`}
                        style={{ backgroundColor: animal.color }}
                      />

                      {/* Small visual border glowing dot */}
                      {isSelected && (
                        <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-amber-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
