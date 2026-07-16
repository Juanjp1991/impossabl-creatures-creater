import type { AnatomicalCategory, AnatomyTemplateId } from "./schema";

export interface AnatomyTemplateDefinition {
  id: AnatomyTemplateId;
  label: string;
  rootCategory: AnatomicalCategory;
  parts: Array<{ category: AnatomicalCategory; min: number; max: number }>;
  sockets: Array<{ category: AnatomicalCategory; min: number; max: number }>;
}

export const ANATOMY_TEMPLATES: Record<AnatomyTemplateId, AnatomyTemplateDefinition> = {
  quadruped: {
    id: "quadruped",
    label: "Quadruped",
    rootCategory: "body",
    parts: [
      { category: "head", min: 1, max: 1 },
      { category: "body", min: 1, max: 1 },
      { category: "forelimbs", min: 1, max: 1 },
      { category: "hindlimbs", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
    sockets: [
      { category: "head", min: 1, max: 1 },
      { category: "forelimbs", min: 1, max: 1 },
      { category: "hindlimbs", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
  },
  bird: {
    id: "bird",
    label: "Bird",
    rootCategory: "body",
    parts: [
      { category: "head", min: 1, max: 1 },
      { category: "body", min: 1, max: 1 },
      { category: "wings", min: 1, max: 1 },
      { category: "legs", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
    sockets: [
      { category: "head", min: 1, max: 1 },
      { category: "wings", min: 1, max: 1 },
      { category: "legs", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
  },
  serpentine: {
    id: "serpentine",
    label: "Serpentine",
    rootCategory: "body",
    parts: [
      { category: "head", min: 1, max: 1 },
      { category: "body", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
    sockets: [
      { category: "head", min: 1, max: 1 },
      { category: "tail", min: 1, max: 1 },
    ],
  },
  scorpion: {
    id: "scorpion",
    label: "Scorpion",
    rootCategory: "body",
    parts: [
      { category: "frontBody", min: 1, max: 1 },
      { category: "body", min: 1, max: 1 },
      { category: "walkingLegs", min: 1, max: 1 },
      { category: "claws", min: 1, max: 1 },
      { category: "segmentedTail", min: 1, max: 1 },
    ],
    sockets: [
      { category: "frontBody", min: 1, max: 1 },
      { category: "walkingLegs", min: 1, max: 1 },
      { category: "claws", min: 1, max: 1 },
      { category: "segmentedTail", min: 1, max: 1 },
    ],
  },
};

