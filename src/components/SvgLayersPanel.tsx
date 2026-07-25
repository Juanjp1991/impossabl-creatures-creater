import React from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import type { LayerMove, SvgLayerNode } from "../editor/svgLayers";

interface SvgLayersPanelProps {
  layers: SvgLayerNode[];
  selectedId: string | null;
  /** Every selected layer, so a marquee selection is reflected in the list. */
  selectedIds?: string[];
  /** `additive` is set when Shift is held, toggling one layer without losing the rest. */
  onSelect: (id: string, additive: boolean) => void;
  onRename: (id: string, name: string) => void;
  onVisibility: (id: string, visible: boolean) => void;
  onLock: (id: string, locked: boolean) => void;
  onMove: (id: string, direction: LayerMove) => void;
}

export const SvgLayersPanel: React.FC<SvgLayersPanelProps> = (props) => {
  const render = (layers: SvgLayerNode[], depth = 0): React.ReactNode => layers.map((layer) => (
    <React.Fragment key={layer.id}>
      <div className={`flex items-center gap-1 rounded border px-1 py-1 ${(props.selectedIds ?? [props.selectedId]).includes(layer.id) ? "border-amber-500/60 bg-amber-500/10" : "border-zinc-800 bg-zinc-950/60"}`} style={{ marginLeft: depth * 10 }}>
        <button type="button" title={layer.visible ? "Hide" : "Show"} onClick={() => props.onVisibility(layer.id, !layer.visible)} className="p-1 text-zinc-400 hover:text-white">{layer.visible ? <Eye size={10}/> : <EyeOff size={10}/>}</button>
        <button type="button" title={layer.locked ? "Unlock" : "Lock"} onClick={() => props.onLock(layer.id, !layer.locked)} className="p-1 text-zinc-400 hover:text-white">{layer.locked ? <Lock size={10}/> : <Unlock size={10}/>}</button>
        <input data-testid={`layer-name-${layer.id}`} value={layer.name} disabled={layer.locked} onFocus={(event) => !layer.locked && props.onSelect(layer.id, (event.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey ?? false)}
          onClick={(event) => !layer.locked && props.onSelect(layer.id, event.shiftKey)} onChange={(event) => props.onRename(layer.id, event.target.value)} className="min-w-0 flex-1 bg-transparent text-[9px] font-mono text-zinc-300 outline-none disabled:text-zinc-600" />
        <span className="text-[7px] uppercase text-zinc-600">{layer.tagName}</span>
        <button type="button" title="Send to back" disabled={layer.locked} onClick={() => props.onMove(layer.id, "back")} className="p-0.5 disabled:opacity-20"><ChevronsDown size={9}/></button>
        <button type="button" title="Send backward" disabled={layer.locked} onClick={() => props.onMove(layer.id, "backward")} className="p-0.5 disabled:opacity-20"><ArrowDown size={9}/></button>
        <button type="button" title="Bring forward" disabled={layer.locked} onClick={() => props.onMove(layer.id, "forward")} className="p-0.5 disabled:opacity-20"><ArrowUp size={9}/></button>
        <button type="button" title="Bring to front" disabled={layer.locked} onClick={() => props.onMove(layer.id, "front")} className="p-0.5 disabled:opacity-20"><ChevronsUp size={9}/></button>
      </div>
      {render(layer.children, depth + 1)}
    </React.Fragment>
  ));
  return <div data-testid="svg-layers-panel" className="max-h-56 overflow-y-auto space-y-1">{render(props.layers)}</div>;
};
