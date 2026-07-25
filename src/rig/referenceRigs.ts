import type { RigDefinition, RigJoint } from "./contracts";

function joint(id: string, targetGroupId: string, partId: string, x: number, y: number, parentJointId?: string, limits: [number, number] = [-90, 90]): RigJoint {
  return { id, name: id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), targetGroupId, partId, parentJointId, pivot: { x, y }, minRotation: limits[0], maxRotation: limits[1], bindRotation: 0 };
}

function rig(joints: RigJoint[]): RigDefinition {
  return { version: "1.0.0", joints, bindPose: Object.fromEntries(joints.map((item) => [item.id, 0])), poses: [] };
}

export function createJawReferenceRig(partId = "head", groups = { jaw: "lower-jaw", teeth: "lower-teeth" }) {
  return rig([
    joint("jaw", groups.jaw, partId, 105, 105, undefined, [-8, 42]),
    joint("jaw-teeth", groups.teeth, partId, 105, 105, "jaw", [0, 0]),
  ]);
}

export function createThreeJointLegReferenceRig(partId = "forelimbs", groups = { upper: "upper-leg", lower: "lower-leg", foot: "foot" }) {
  return rig([
    joint("hip", groups.upper, partId, 75, 15, undefined, [-55, 55]),
    joint("knee", groups.lower, partId, 72, 85, "hip", [-95, 20]),
    joint("ankle", groups.foot, partId, 70, 150, "knee", [-35, 35]),
  ]);
}

export function createScorpionTailReferenceRig(partId = "segmentedTail", groupPrefix = "tail-segment", stingerGroup = "stinger") {
  const joints: RigJoint[] = [];
  for (let index = 0; index < 9; index++) joints.push(joint(`tail-${index + 1}`, `${groupPrefix}-${index + 1}`, partId, 15 + index * 14, 100 - index * 9, index ? `tail-${index}` : undefined, [-35, 35]));
  joints.push(joint("stinger", stingerGroup, partId, 141, 28, "tail-9", [-50, 50]));
  return rig(joints);
}

