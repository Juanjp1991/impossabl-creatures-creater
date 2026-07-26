import { Image, Loader2 } from "lucide-react";
import type { ReferenceMode } from "../generation/contracts";

/**
 * §R1 "is a reference active?" chip, shown next to the re-roll and vary controls — the two
 * places that silently send the reference with every call.
 */
export function ReferenceIndicator({ active, loading, mode }: { active: boolean; loading?: boolean; mode: ReferenceMode }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-mono text-zinc-500">
        <Loader2 size={9} className="animate-spin" /> reference…
      </span>
    );
  }
  return (
    <span
      title={active
        ? `Re-rolls and variations are sent with the reference image (${mode === "match" ? "close match" : "loose inspiration"}).`
        : "No reference image is attached, so re-rolls and variations go on the brief alone."}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono ${
        active
          ? "border-amber-600/60 bg-amber-500/10 text-amber-400"
          : "border-zinc-800 bg-zinc-900 text-zinc-600"
      }`}
    >
      <Image size={9} />
      {active ? `reference: ${mode === "match" ? "match" : "inspire"}` : "no reference"}
    </span>
  );
}
