import React from "react";

export type AnimalPartType = "head" | "body" | "legs" | "tail";

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
  legs: ConnectionPoint;
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
    legs: AnimalPart;
    tail: AnimalPart;
  };
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
  legs: string; // animalId supplying the legs
  tail: string; // animalId supplying the tail
}

export interface AdjustmentsState {
  head: PartAdjustment;
  body: PartAdjustment;
  legs: PartAdjustment;
  tail: PartAdjustment;
  shapeAdjustments?: {
    head: PartShapeAdjustments;
    body: PartShapeAdjustments;
    legs: PartShapeAdjustments;
    tail: PartShapeAdjustments;
  };
}
