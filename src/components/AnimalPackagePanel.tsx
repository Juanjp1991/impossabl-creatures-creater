import React, { useMemo, useRef, useState } from "react";
import { Boxes, Download, FileCheck2, Upload } from "lucide-react";
import type { Animal } from "../types";
import {
  animalPackageToLegacyEditorAnimal,
  buildNeutralPackagePreview,
  compileLegacyAnimalPackage,
  parseAnimalPackageJson,
  serializeAnimalPackage,
  serializeAnimalPackageBundle,
} from "../animalPackage";

interface AnimalPackagePanelProps {
  animals: Animal[];
  selectedAnimalId: string;
  onImport: (animal: Animal) => void;
}

function downloadJson(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const AnimalPackagePanel: React.FC<AnimalPackagePanelProps> = ({ animals, selectedAnimalId, onImport }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("Packages are validated before import or export.");
  const selected = animals.find((animal) => animal.id === selectedAnimalId) ?? animals[0];
  const compiled = useMemo(() => {
    try { return { package: compileLegacyAnimalPackage(selected), error: "" }; }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  }, [selected]);
  const preview = useMemo(() => compiled.package ? buildNeutralPackagePreview(compiled.package) : "", [compiled.package]);

  const exportSelected = () => {
    if (!compiled.package) { setMessage(compiled.error); return; }
    downloadJson(`${compiled.package.animalId}-${compiled.package.assetVersion}.animal.json`, serializeAnimalPackage(compiled.package));
    setMessage(`Exported ${compiled.package.name} as a validated deterministic package.`);
  };

  const exportBuiltIns = () => {
    try {
      const packages = animals.filter((animal) => !animal.id.startsWith("custom-")).map((animal) => compileLegacyAnimalPackage(animal));
      downloadJson("official-animal-library-1.0.0.json", serializeAnimalPackageBundle(packages));
      setMessage(`Exported ${packages.length} validated official packages.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseAnimalPackageJson(await file.text());
      if (!parsed.package) {
        setMessage(`Import rejected: ${parsed.validation.issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.message}`).join(" ")}`);
        return;
      }
      const animal = animalPackageToLegacyEditorAnimal(parsed.package);
      onImport(animal);
      setMessage(`Imported ${parsed.package.name}; ${parsed.package.parts.length} parts and ${parsed.package.sockets.length} sockets passed compatibility checks.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <Boxes size={14} className="text-amber-500" />
        <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">Animal Package V1</h3>
      </div>
      {preview && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} alt={`Neutral export preview of ${selected.name}`} className="w-full h-36 object-contain bg-zinc-950 rounded-lg border border-zinc-800" />}
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
        <FileCheck2 size={12} className={compiled.package ? "text-emerald-400" : "text-red-400"} />
        <span>{compiled.package ? `${selected.name}: compatible` : "Package validation failed"}</span>
      </div>
      <p className="text-[10px] leading-relaxed text-zinc-500">{message}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={exportSelected} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[10px] font-mono font-bold"><Download size={11} /> Export selected</button>
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono font-bold"><Upload size={11} /> Import package</button>
        <button type="button" onClick={exportBuiltIns} className="col-span-2 flex items-center justify-center gap-1.5 px-2 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono font-bold"><Boxes size={11} /> Batch export official library</button>
      </div>
      <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
    </section>
  );
};

