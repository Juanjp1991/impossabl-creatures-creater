export interface RigPoint {
  x: number;
  y: number;
}

export interface RigJoint {
  /** Stable ID used by poses and animation. */
  id: string;
  name: string;
  /** Stable SVG group controlled by this joint. */
  targetGroupId: string;
  partId: string;
  parentJointId?: string;
  pivot: RigPoint;
  minRotation: number;
  maxRotation: number;
  bindRotation: number;
}

export interface RigPose {
  id: string;
  name: string;
  rotations: Record<string, number>;
}

export interface RigDefinition {
  version: "1.0.0";
  joints: RigJoint[];
  /** Neutral pose must always reconstruct the approved source artwork. */
  bindPose: Record<string, number>;
  poses: RigPose[];
}

export interface RigMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface RigValidationIssue {
  code: string;
  path: string;
  message: string;
}

