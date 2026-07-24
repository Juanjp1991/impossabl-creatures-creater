// The multi-round validate -> LLM-review -> repair loop lived here. It is deleted (§5.3):
// parallel-sample-and-select (sampleSelection.ts) supersedes it, and manual per-part
// touch-up is served by /api/modify-animal. Only the guided-brief auto-fill remains.

import type { GuidedAnimalBrief, ReferenceMode } from "./contracts";
import { postJson } from "./apiClient";

export async function populateGuidedBrief(input: { currentBrief: GuidedAnimalBrief; image: string | null; referenceMode: ReferenceMode }): Promise<GuidedAnimalBrief> {
  const result = await postJson("/api/populate-brief", input);
  return result.brief as GuidedAnimalBrief;
}
