import React from "react";

export type AnimalPartType = "head" | "body" | "frontLegs" | "backLegs" | "tail";

export interface ConnectionPoint {
  x: number;
  y: number;
}

export interface PartConnectionPoints {
  // Connection points relative to the part's local coordinate space
  neck?: ConnectionPoint; // For head, neck connection point
  body?: ConnectionPoint; // For tail and legs, the body connection point
}

export interface BodyConnectionPoints {
  // Body-specific points where other parts attach (in local space of the body)
  neck: ConnectionPoint;
  tail: ConnectionPoint;
  frontLegs: ConnectionPoint;
  backLegs: ConnectionPoint;
}

export interface AnimalPart {
  id: string;
  animalId: string;
  type: AnimalPartType;
  name: string;
  viewBox: string;
  connections: PartConnectionPoints;
  // A function that renders the SVG elements for this part
  render: (props: { color?: string; accentColor?: string }) => React.ReactNode;
  // Raw path representation or elements for generating text SVGs
  rawContent: string; 
}

export interface Animal {
  id: string;
  name: string;
  color: string; // Primary base color of the animal
  accentColor: string; // Accent/details color
  description: string;
  bodyConnections: BodyConnectionPoints;
  parts: {
    head: AnimalPart;
    body: AnimalPart;
    frontLegs: AnimalPart;
    backLegs: AnimalPart;
    tail: AnimalPart;
  };
  /** Optional, backward-compatible provenance for AI-generated animals. */
  generationMetadata?: import("./generation/contracts").GenerationMetadata;
  /** Optional Phase 4 forward-kinematic rig and named poses. */
  rig?: import("./rig/contracts").RigDefinition;
}

export interface PartAdjustment {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface ShapeAdjustment {
  translateX: number;
  translateY: number;
  rotate: number;
  scale: number;
  fill?: string;
}

export type PartShapeAdjustments = Record<number, ShapeAdjustment>;

export interface CreatureState {
  head: string; // animalId supplying the head
  body: string; // animalId supplying the body
  frontLegs: string; // animalId supplying the front legs
  backLegs: string; // animalId supplying the back legs
  tail: string; // animalId supplying the tail
}

export interface AdjustmentsState {
  head: PartAdjustment;
  body: PartAdjustment;
  frontLegs: PartAdjustment;
  backLegs: PartAdjustment;
  tail: PartAdjustment;
  shapeAdjustments?: {
    head: PartShapeAdjustments;
    body: PartShapeAdjustments;
    frontLegs: PartShapeAdjustments;
    backLegs: PartShapeAdjustments;
    tail: PartShapeAdjustments;
  };
}
