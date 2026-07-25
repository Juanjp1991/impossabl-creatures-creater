import { useMemo } from "react";
import { buildHybridSvg, type HybridRecipeV1 } from "../../src/animalPackage/hybrid";
import type { AnimalPackageV1 } from "../../src/animalPackage/schema";

export function HybridPreview({ recipe, library, animated = true }: { recipe: HybridRecipeV1; library: AnimalPackageV1[]; animated?: boolean }) {
  const markup = useMemo(() => buildHybridSvg(recipe, library), [recipe, library]);
  return <div className={animated ? "hybrid-preview is-animated" : "hybrid-preview"} dangerouslySetInnerHTML={{ __html: markup }} />;
}
