import React from "react";
import { Animal, CreatureState } from "../types";
import { Sparkles, Info, Plus, Trash2 } from "lucide-react";

interface AnimalLibraryProps {
  animals: Animal[];
  onSelectFull: (animalId: string) => void;
  creatureState: CreatureState;
  onOpenAddModal: () => void;
  onDeleteAnimal: (animalId: string) => void;
  onEditAnimal?: (animal: Animal) => void;
}

export const AnimalLibrary: React.FC<AnimalLibraryProps> = ({
  animals,
  onSelectFull,
  creatureState,
  onOpenAddModal,
  onDeleteAnimal,
  onEditAnimal,
}) => {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800 select-none">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-amber-500" />
          <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
            Animal Template Library
          </h3>
        </div>
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded text-[10px] font-mono font-bold transition-all hover:scale-105 active:scale-95 shadow"
        >
          <Plus size={10} strokeWidth={3} />
          <span>ADD CUSTOM</span>
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {animals.map((animal) => {
          // Check if currently configured creature is purely this animal
          const isPurebred =
            creatureState.head === animal.id &&
            creatureState.body === animal.id &&
            creatureState.frontLegs === animal.id &&
            creatureState.backLegs === animal.id &&
            creatureState.tail === animal.id;

          return (
            <div
              key={animal.id}
              className={`group relative bg-zinc-950/60 hover:bg-zinc-950 border transition-all rounded-xl p-4 flex flex-col gap-3 ${
                isPurebred
                  ? "border-amber-500 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "border-zinc-800/80 hover:border-zinc-700/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-sm font-bold text-zinc-100 group-hover:text-amber-500 transition-colors">
                      {animal.name}
                    </h4>
                    {isPurebred && (
                      <span className="text-[9px] font-mono font-bold text-amber-500 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30 uppercase tracking-wider">
                        Purebred
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 leading-normal font-sans">
                    {animal.description}
                  </p>
                </div>
                {animal.id.startsWith("custom-") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnimal(animal.id);
                    }}
                    title="Delete Custom Animal Template"
                    className="p-1.5 bg-zinc-800 hover:bg-red-950/50 hover:text-red-400 text-zinc-400 rounded-lg transition-colors border border-zinc-700/50 hover:border-red-900/50 flex items-center justify-center h-7 w-7"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Standing Miniature SVG Preview */}
              <div className="relative w-full h-[120px] bg-zinc-900/60 rounded-lg border border-zinc-800/60 overflow-hidden flex items-center justify-center select-none">
                <MiniAnimalPreview animal={animal} />
                <div className="absolute top-2 left-2 text-[8px] font-mono text-zinc-500 bg-zinc-950/40 px-1 rounded uppercase">
                  Template Preview
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 mt-1.5">
                {/* Color swatch dot */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-zinc-700 block"
                    style={{ backgroundColor: animal.color }}
                  />
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    {animal.color}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {onEditAnimal && (
                    <button
                      onClick={() => onEditAnimal(animal)}
                      className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded text-[10px] font-mono font-bold transition-all active:scale-95 border border-zinc-700/50"
                    >
                      Modify Template
                    </button>
                  )}
                  <button
                    onClick={() => onSelectFull(animal.id)}
                    className={`px-3 py-1.5 rounded text-[10px] font-mono font-bold transition-all active:scale-95 ${
                      isPurebred
                        ? "bg-amber-550 text-zinc-950 font-bold bg-amber-500 hover:bg-amber-400"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    }`}
                  >
                    Equip Full Set
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Elegant Mini Preview Component to draw Grizzly or Cheetah in-place
const MiniAnimalPreview: React.FC<{ animal: Animal }> = ({ animal }) => {
  // Compute default skeletal translation positions for pure template rendering
  // Compute default skeletal translation positions for pure template rendering safely
  const neckTarget = animal.bodyConnections?.neck || { x: 75, y: 95 };
  const tailTarget = animal.bodyConnections?.tail || { x: 265, y: 110 };
  const frontLegsTarget = animal.bodyConnections?.frontLegs || { x: 115, y: 165 };
  const backLegsTarget = animal.bodyConnections?.backLegs || { x: 235, y: 165 };

  const headPart = animal.parts.head;
  const bodyPart = animal.parts.body;
  const frontLegsPart = animal.parts.frontLegs;
  const backLegsPart = animal.parts.backLegs;
  const tailPart = animal.parts.tail;

  // We place the body local (0,0) at translation (15, 10) inside a 330x220 canvas
  const bodyTranslate = { x: 15, y: 10 };

  const neckT = { x: bodyTranslate.x + neckTarget.x, y: bodyTranslate.y + neckTarget.y };
  const tailT = { x: bodyTranslate.x + tailTarget.x, y: bodyTranslate.y + tailTarget.y };
  const frontLegsT = { x: bodyTranslate.x + frontLegsTarget.x, y: bodyTranslate.y + frontLegsTarget.y };
  const backLegsT = { x: bodyTranslate.x + backLegsTarget.x, y: bodyTranslate.y + backLegsTarget.y };

  const headLocalNeck = headPart.connections.neck || { x: 0, y: 0 };
  const headT = { x: neckT.x - headLocalNeck.x, y: neckT.y - headLocalNeck.y };

  const tailLocalBody = tailPart.connections.body || { x: 0, y: 0 };
  const tailT_final = { x: tailT.x - tailLocalBody.x, y: tailT.y - tailLocalBody.y };

  const frontLegsLocalBody = frontLegsPart.connections.body || { x: 0, y: 0 };
  const frontLegsT_final = { x: frontLegsT.x - frontLegsLocalBody.x, y: frontLegsT.y - frontLegsLocalBody.y };

  const backLegsLocalBody = backLegsPart.connections.body || { x: 0, y: 0 };
  const backLegsT_final = { x: backLegsT.x - backLegsLocalBody.x, y: backLegsT.y - backLegsLocalBody.y };

  return (
    <svg viewBox="0 0 330 220" className="w-full h-full p-2">
      {/* 1. Tail */}
      <g transform={`translate(${tailT_final.x}, ${tailT_final.y})`}>
        {tailPart.render({ color: animal.color, accentColor: animal.accentColor })}
      </g>
      {/* 2. Back Legs */}
      <g transform={`translate(${backLegsT_final.x}, ${backLegsT_final.y})`}>
        {backLegsPart.render({ color: animal.color, accentColor: animal.accentColor })}
      </g>
      {/* 3. Body */}
      <g transform={`translate(${bodyTranslate.x}, ${bodyTranslate.y})`}>
        {bodyPart.render({ color: animal.color, accentColor: animal.accentColor })}
      </g>
      {/* 4. Front Legs */}
      <g transform={`translate(${frontLegsT_final.x}, ${frontLegsT_final.y})`}>
        {frontLegsPart.render({ color: animal.color, accentColor: animal.accentColor })}
      </g>
      {/* 5. Head */}
      <g transform={`translate(${headT.x}, ${headT.y})`}>
        {headPart.render({ color: animal.color, accentColor: animal.accentColor })}
      </g>
    </svg>
  );
};
