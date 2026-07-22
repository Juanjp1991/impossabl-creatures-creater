import type { RigDefinition, RigJoint, RigMatrix, RigPose, RigValidationIssue } from "./contracts";

export const IDENTITY_MATRIX: RigMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function multiplyRigMatrices(left: RigMatrix, right: RigMatrix): RigMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function rotationAround(degrees: number, x: number, y: number): RigMatrix {
  if (degrees === 0) return IDENTITY_MATRIX;
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return { a: cosine, b: sine, c: -sine, d: cosine, e: x - cosine * x + sine * y, f: y - sine * x - cosine * y };
}

export function clampJointRotation(joint: RigJoint, rotation: number) {
  return Math.min(joint.maxRotation, Math.max(joint.minRotation, Number.isFinite(rotation) ? rotation : joint.bindRotation));
}

export function resolvePoseRotations(rig: RigDefinition, pose?: RigPose | Record<string, number>) {
  const supplied: Record<string, number> | undefined = pose && typeof (pose as RigPose).rotations === "object"
    ? (pose as RigPose).rotations
    : pose as Record<string, number> | undefined;
  return Object.fromEntries(rig.joints.map((joint) => [joint.id, clampJointRotation(joint, supplied?.[joint.id] ?? rig.bindPose[joint.id] ?? joint.bindRotation)]));
}

/** Returns absolute matrices, so a parent rotation carries all descendants. */
export function computeForwardKinematics(rig: RigDefinition, pose?: RigPose | Record<string, number>) {
  const rotations = resolvePoseRotations(rig, pose);
  const byId = new Map(rig.joints.map((joint) => [joint.id, joint]));
  const matrices = new Map<string, RigMatrix>();
  const visiting = new Set<string>();
  const visit = (joint: RigJoint): RigMatrix => {
    const cached = matrices.get(joint.id);
    if (cached) return cached;
    if (visiting.has(joint.id)) throw new Error(`Rig contains a parent cycle at '${joint.id}'.`);
    visiting.add(joint.id);
    const local = rotationAround(rotations[joint.id], joint.pivot.x, joint.pivot.y);
    const parent = joint.parentJointId ? byId.get(joint.parentJointId) : undefined;
    if (joint.parentJointId && !parent) throw new Error(`Joint '${joint.id}' references missing parent '${joint.parentJointId}'.`);
    const matrix = parent ? multiplyRigMatrices(visit(parent), local) : local;
    visiting.delete(joint.id);
    matrices.set(joint.id, matrix);
    return matrix;
  };
  for (const joint of rig.joints) visit(joint);
  return { rotations, matrices };
}

export function computeLocalJointMatrices(rig: RigDefinition, pose?: RigPose | Record<string, number>) {
  const rotations = resolvePoseRotations(rig, pose);
  return new Map(rig.joints.map((joint) => [joint.id, rotationAround(rotations[joint.id], joint.pivot.x, joint.pivot.y)]));
}

export function rigMatrixToSvg(matrix: RigMatrix) {
  const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map((value) => Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(6)));
  return `matrix(${values.join(" ")})`;
}

export function validateRigDefinition(rig: unknown, availableGroupIds?: Iterable<string>) {
  const issues: RigValidationIssue[] = [];
  if (!rig || typeof rig !== "object") return { valid: false, issues: [{ code: "rig.object", path: "rig", message: "Rig must be an object." }] };
  const value = rig as Partial<RigDefinition>;
  const joints = Array.isArray(value.joints) ? value.joints : [];
  const ids = new Set<string>();
  const groups = availableGroupIds ? new Set(availableGroupIds) : undefined;
  for (const [index, joint] of joints.entries()) {
    const path = `rig.joints[${index}]`;
    if (!joint.id || ids.has(joint.id)) issues.push({ code: "joint.id", path: `${path}.id`, message: `Joint ID '${joint.id || ""}' is missing or duplicated.` });
    ids.add(joint.id);
    if (!joint.targetGroupId) issues.push({ code: "joint.group", path: `${path}.targetGroupId`, message: "Joint target group is required." });
    else if (groups && !groups.has(joint.targetGroupId)) issues.push({ code: "joint.group.missing", path: `${path}.targetGroupId`, message: `Target group '${joint.targetGroupId}' does not exist.` });
    if (!Number.isFinite(joint.pivot?.x) || !Number.isFinite(joint.pivot?.y)) issues.push({ code: "joint.pivot", path: `${path}.pivot`, message: "Joint pivot must contain finite coordinates." });
    if (!Number.isFinite(joint.minRotation) || !Number.isFinite(joint.maxRotation) || joint.minRotation > joint.maxRotation) issues.push({ code: "joint.limits", path, message: "Joint rotation limits are invalid." });
    if (joint.bindRotation < joint.minRotation || joint.bindRotation > joint.maxRotation) issues.push({ code: "joint.bind", path: `${path}.bindRotation`, message: "Bind rotation must be inside joint limits." });
  }
  for (const [index, joint] of joints.entries()) if (joint.parentJointId && !ids.has(joint.parentJointId)) issues.push({ code: "joint.parent", path: `rig.joints[${index}].parentJointId`, message: `Parent '${joint.parentJointId}' does not exist.` });
  try { if (joints.length) computeForwardKinematics(value as RigDefinition); }
  catch (error) { issues.push({ code: "joint.cycle", path: "rig.joints", message: error instanceof Error ? error.message : String(error) }); }
  for (const [index, pose] of (value.poses || []).entries()) {
    for (const jointId of Object.keys(pose.rotations || {})) if (!ids.has(jointId)) issues.push({ code: "pose.joint", path: `rig.poses[${index}].rotations.${jointId}`, message: `Pose references unknown joint '${jointId}'.` });
  }
  for (const joint of joints) if (!Number.isFinite(value.bindPose?.[joint.id])) issues.push({ code: "bind.missing", path: `rig.bindPose.${joint.id}`, message: `Bind pose is missing joint '${joint.id}'.` });
  return { valid: issues.length === 0, issues };
}

export function createNamedPose(rig: RigDefinition, id: string, name: string, rotations: Record<string, number>): RigPose {
  return { id, name, rotations: resolvePoseRotations(rig, rotations) };
}
