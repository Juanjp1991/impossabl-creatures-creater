export const ANIMAL_PACKAGE_FORMAT_VERSION = "1.0.0" as const;

export type AnatomyTemplateId = "quadruped" | "bird" | "serpentine" | "scorpion";

export type AnatomicalCategory =
  | "head"
  | "body"
  | "forelimbs"
  | "hindlimbs"
  | "tail"
  | "wings"
  | "legs"
  | "frontBody"
  | "walkingLegs"
  | "claws"
  | "segmentedTail";

export interface PackagePoint {
  x: number;
  y: number;
}

export interface PackageVector {
  x: number;
  y: number;
}

export interface SocketProfileV1 {
  /** Unit vector pointing away from the socket owner. */
  outwardNormal: PackageVector;
  seamWidth: number;
  minimumOverlap: number;
  allowedScale: { min: number; max: number };
}

export interface AttachmentProfileV1 {
  /** Unit vector pointing back into the socket owner. */
  opposingNormal: PackageVector;
  seamWidth: number;
  neutralConnectionDepth: number;
}

export interface GroundContactV1 extends PackagePoint {
  /** A deliberately lifted paw/foot is excluded from ground alignment. */
  raised?: boolean;
}

export interface LimbDepthGroupsV1 {
  farGroupId: string;
  nearGroupId: string;
}

export interface PackageViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimalSocketV1 {
  /** Stable within every version of this animal. */
  id: string;
  name: string;
  ownerPartId: string;
  category: AnatomicalCategory;
  accepts: AnatomicalCategory[];
  anchor: PackagePoint;
  required: boolean;
  profile?: SocketProfileV1;
}

export interface PartAttachmentV1 {
  socketId: string;
  /** Attachment point in the part's local coordinate space. */
  anchor: PackagePoint;
  profile?: AttachmentProfileV1;
}

export interface JointMetadataV1 {
  id: string;
  name: string;
  pivot: PackagePoint;
  parentJointId?: string;
  minRotation?: number;
  maxRotation?: number;
}

export interface AnimalPartV1 {
  /** Permanent part ID; it must not depend on array position. */
  id: string;
  name: string;
  category: AnatomicalCategory;
  viewBox: PackageViewBox;
  svg: string;
  namedGroups: string[];
  layerOrder: number;
  attachment?: PartAttachmentV1;
  pivot?: PackagePoint;
  joints?: JointMetadataV1[];
  groundContacts?: GroundContactV1[];
  depthGroups?: LimbDepthGroupsV1;
  /** Optional game-facing values. The asset remains renderable without them. */
  gameplay?: {
    traits?: string[];
    stats?: Record<string, number>;
  };
}

export interface AnimalPackageV1 {
  formatVersion: typeof ANIMAL_PACKAGE_FORMAT_VERSION;
  /** Permanent animal ID across asset revisions. */
  animalId: string;
  /** SemVer revision of the immutable asset package. */
  assetVersion: string;
  name: string;
  description: string;
  palette: {
    primary: string;
    accent: string;
    additional?: Record<string, string>;
  };
  anatomyTemplateId: AnatomyTemplateId;
  centralSkeleton: {
    rootPartId: string;
    viewBox: PackageViewBox;
  };
  compatibility?: {
    facing: "left" | "right";
    /** Neutral ground line in root-part local coordinates. */
    groundY: number;
  };
  sockets: AnimalSocketV1[];
  parts: AnimalPartV1[];
  gameplay?: {
    traits?: string[];
    stats?: Record<string, number>;
  };
  rig?: import("../rig/contracts").RigDefinition;
  metadata: {
    createdAt: string;
    updatedAt: string;
    creator?: string;
    source?: "built-in" | "custom" | "imported" | "legacy-migration";
  };
}
