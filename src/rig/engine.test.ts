import assert from "node:assert/strict";
import test from "node:test";
import { ANIMALS } from "../animalsData";
import { animalPackageToLegacyEditorAnimal, compileLegacyAnimalPackage, serializeAnimalPackage } from "../animalPackage/compiler";
import type { RigDefinition } from "./contracts";
import { computeForwardKinematics, createNamedPose, resolvePoseRotations, validateRigDefinition } from "./engine";
import { createJawReferenceRig, createScorpionTailReferenceRig, createThreeJointLegReferenceRig } from "./referenceRigs";

test("jaw rotation carries its child teeth and respects limits", () => {
  const rig = createJawReferenceRig();
  const result = computeForwardKinematics(rig, { jaw: 30, "jaw-teeth": 0 });
  assert.deepEqual(result.matrices.get("jaw-teeth"), result.matrices.get("jaw"));
  assert.equal(resolvePoseRotations(rig, { jaw: 100 }).jaw, 42);
});

test("three-joint leg uses forward kinematics and neutral bind pose is identity", () => {
  const rig = createThreeJointLegReferenceRig();
  const neutral = computeForwardKinematics(rig);
  for (const matrix of neutral.matrices.values()) assert.deepEqual(matrix, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const posed = computeForwardKinematics(rig, { hip: 20, knee: -35, ankle: 10 });
  assert.notDeepEqual(posed.matrices.get("ankle"), posed.matrices.get("knee"));
  assert.notEqual(posed.matrices.get("ankle")!.e, 0);
});

test("scorpion reference rig contains nine carried segments and a stinger", () => {
  const rig = createScorpionTailReferenceRig();
  assert.equal(rig.joints.length, 10);
  assert.equal(rig.joints[8].id, "tail-9");
  assert.equal(rig.joints[9].parentJointId, "tail-9");
  const result = computeForwardKinematics(rig, { "tail-1": 15, "tail-9": 20, stinger: 30 });
  assert.notEqual(result.matrices.get("stinger")!.e, 0);
});

test("rig validation rejects parent cycles and poses with unknown joints", () => {
  const rig = createThreeJointLegReferenceRig();
  rig.joints[0].parentJointId = "ankle";
  rig.poses.push({ id: "bad", name: "Bad", rotations: { missing: 10 } });
  const result = validateRigDefinition(rig);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "joint.cycle"));
  assert.ok(result.issues.some((issue) => issue.code === "pose.joint"));
});

test("named poses and rig metadata survive package export and editor re-import", () => {
  const bear = ANIMALS.find((animal) => animal.id === "bear")!;
  const rig: RigDefinition = {
    version: "1.0.0",
    joints: [{ id: "head-pivot", name: "Head Pivot", targetGroupId: "bear-head-root", partId: "head", pivot: { x: 120, y: 110 }, minRotation: -20, maxRotation: 20, bindRotation: 0 }],
    bindPose: { "head-pivot": 0 },
    poses: [],
  };
  rig.poses.push(createNamedPose(rig, "alert", "Alert", { "head-pivot": 12 }));
  const compiled = compileLegacyAnimalPackage({ ...bear, rig });
  assert.match(serializeAnimalPackage(compiled), /"alert"/);
  const imported = animalPackageToLegacyEditorAnimal(compiled);
  assert.equal(imported.rig?.poses[0].rotations["head-pivot"], 12);
  assert.equal(compileLegacyAnimalPackage(imported).rig?.joints.length, 1);
});

