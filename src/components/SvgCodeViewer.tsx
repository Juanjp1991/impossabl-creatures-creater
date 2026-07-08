import React, { useState } from "react";
import { Code, Copy, Download, Check, HelpCircle } from "lucide-react";

interface SvgCodeViewerProps {
  fullSvgCode: string;
  isolatedSvgCode: string;
  activePartName: string | null;
  onDownloadFull: () => void;
  onDownloadIsolated: () => void;
  onCopyFull: () => void;
  onCopyIsolated: () => void;
}

export const SvgCodeViewer: React.FC<SvgCodeViewerProps> = ({
  fullSvgCode,
  isolatedSvgCode,
  activePartName,
  onDownloadFull,
  onDownloadIsolated,
  onCopyFull,
  onCopyIsolated,
}) => {
  const [activeTab, setActiveTab] = useState<"full" | "isolated">("full");
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedIso, setCopiedIso] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopyFull = () => {
    onCopyFull();
    setCopiedFull(true);
    setTimeout(() => setCopiedFull(false), 2000);
  };

  const handleCopyIsolated = () => {
    onCopyIsolated();
    setCopiedIso(true);
    setTimeout(() => setCopiedIso(false), 2000);
  };

  const formatCode = (raw: string) => {
    if (!raw) return "No SVG rendered yet.";
    // Simple prettifier helper
    let formatted = "";
    let reg = /(>)(<)(\/*)/g;
    let xml = raw.replace(reg, "$1\r\n$2$3");
    let pad = 0;
    xml.split("\r\n").forEach((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) {
          pad -= 2;
        }
      } else if (node.match(/^<\w[^>]*[^\/]>$/)) {
        indent = 2;
      } else {
        indent = 0;
      }

      formatted += " ".repeat(pad) + node + "\n";
      pad += indent;
    });
    return formatted.trim();
  };

  const currentCode = activeTab === "full" ? fullSvgCode : isolatedSvgCode;
  const isCodeAvailable = !!currentCode;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800 select-none">
        <div className="flex items-center gap-2">
          <Code size={14} className="text-amber-500" />
          <h3 className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
            Generated SVG Asset Code
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
          >
            {isCollapsed ? "Expand Code View" : "Collapse Code View"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-5 flex flex-col gap-4">
          {/* Tabs and download bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
            {/* Tab Toggles */}
            <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg self-start">
              <button
                onClick={() => setActiveTab("full")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-bold transition-all ${
                  activeTab === "full"
                    ? "bg-zinc-800 text-amber-500 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Full Creature SVG
              </button>
              <button
                onClick={() => setActiveTab("isolated")}
                disabled={!activePartName}
                className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-bold transition-all disabled:opacity-45 disabled:cursor-not-allowed ${
                  activeTab === "isolated"
                    ? "bg-zinc-800 text-amber-500 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                title={!activePartName ? "Select a part to view isolated code" : undefined}
              >
                Isolated {activePartName ? activePartName : "Part"} SVG
              </button>
            </div>

            {/* Quick Export Panel Actions */}
            {isCodeAvailable && (
              <div className="flex items-center gap-2">
                {activeTab === "full" ? (
                  <>
                    <button
                      onClick={handleCopyFull}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono font-bold text-zinc-200 transition-all active:scale-95"
                    >
                      {copiedFull ? (
                        <>
                          <Check size={12} className="text-amber-500" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy Full SVG</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={onDownloadFull}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-[11px] font-mono font-bold text-zinc-950 transition-all active:scale-95"
                    >
                      <Download size={12} />
                      <span>Download SVG</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleCopyIsolated}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono font-bold text-zinc-200 transition-all active:scale-95"
                    >
                      {copiedIso ? (
                        <>
                          <Check size={12} className="text-amber-500" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy Part SVG</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={onDownloadIsolated}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-[11px] font-mono font-bold text-zinc-950 transition-all active:scale-95"
                    >
                      <Download size={12} />
                      <span>Download Part SVG</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Code Window */}
          <div className="relative">
            <pre className="w-full h-44 overflow-auto bg-zinc-950 p-4 rounded-lg border border-zinc-850 font-mono text-[10px] text-zinc-400 leading-relaxed scrollbar-thin scrollbar-thumb-zinc-800">
              <code>{formatCode(currentCode)}</code>
            </pre>
            
            <div className="absolute bottom-2.5 right-3 text-[9px] font-mono text-zinc-600 pointer-events-none select-none">
              STANDALONE COMPATIBLE SVG
            </div>
          </div>

          {/* Game Engine Import Tip */}
          <div className="flex gap-2.5 items-start p-3 bg-zinc-950/40 border border-zinc-800/40 rounded-lg">
            <HelpCircle size={13} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-zinc-500 leading-normal font-mono">
              <strong>Asset Integration Note:</strong> The exported file is standard Vector SVG. It can be directly loaded into Unity, Unreal Engine, Godot, or raw web canvases, keeping body parts as separate <code className="text-zinc-400 font-bold">&lt;g&gt;</code> tags for modular in-game animation (e.g., skeletal leg swinging, head turning).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
