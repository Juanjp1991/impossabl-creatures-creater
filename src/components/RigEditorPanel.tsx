import React from "react";
import { Bone, Plus, Save, Trash2 } from "lucide-react";
import type { RigDefinition, RigJoint } from "../rig/contracts";
import { createNamedPose } from "../rig/engine";
import { createJawReferenceRig, createScorpionTailReferenceRig, createThreeJointLegReferenceRig } from "../rig/referenceRigs";

interface RigEditorPanelProps {
  partId: string;
  selectedGroupId: string | null;
  groupIds: string[];
  defaultPivot: { x: number; y: number };
  rig?: RigDefinition;
  rotations: Record<string, number>;
  onRigChange: (rig?: RigDefinition) => void;
  onRotationsChange: (rotations: Record<string, number>) => void;
}

const emptyRig = (): RigDefinition => ({ version: "1.0.0", joints: [], bindPose: {}, poses: [] });
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "joint";

export const RigEditorPanel: React.FC<RigEditorPanelProps> = (props) => {
  const rig = props.rig ?? emptyRig();
  const partJoints = rig.joints.filter((joint) => joint.partId === props.partId);
  const selectedIndex = Math.max(0, props.groupIds.indexOf(props.selectedGroupId || ""));
  const available = props.groupIds.slice(selectedIndex);

  const replacePartRig = (reference: RigDefinition) => {
    const retained = rig.joints.filter((joint) => joint.partId !== props.partId);
    const joints = [...retained, ...reference.joints];
    const bindPose = Object.fromEntries(joints.map((joint) => [joint.id, rig.bindPose[joint.id] ?? reference.bindPose[joint.id] ?? joint.bindRotation]));
    props.onRigChange({ ...rig, joints, bindPose, poses: rig.poses.map((pose) => ({ ...pose, rotations: Object.fromEntries(Object.entries(pose.rotations).filter(([id]) => joints.some((joint) => joint.id === id))) })) });
    props.onRotationsChange(bindPose);
  };

  const reference = (kind: "jaw" | "leg" | "tail") => {
    if (kind === "jaw" && available.length >= 2) replacePartRig(createJawReferenceRig(props.partId, { jaw: available[0], teeth: available[1] }));
    if (kind === "leg" && available.length >= 3) replacePartRig(createThreeJointLegReferenceRig(props.partId, { upper: available[0], lower: available[1], foot: available[2] }));
    if (kind === "tail" && available.length >= 10) {
      const created = createScorpionTailReferenceRig(props.partId);
      created.joints.forEach((joint, index) => { joint.targetGroupId = available[index]; });
      replacePartRig(created);
    }
  };

  const addJoint = () => {
    if (!props.selectedGroupId) return;
    const base = `${slug(props.partId)}-${slug(props.selectedGroupId)}-joint`;
    let id = base; let suffix = 2;
    while (rig.joints.some((joint) => joint.id === id)) id = `${base}-${suffix++}`;
    const joint: RigJoint = { id, name: props.selectedGroupId, targetGroupId: props.selectedGroupId, partId: props.partId, pivot: props.defaultPivot, minRotation: -90, maxRotation: 90, bindRotation: 0 };
    props.onRigChange({ ...rig, joints: [...rig.joints, joint], bindPose: { ...rig.bindPose, [id]: 0 } });
    props.onRotationsChange({ ...props.rotations, [id]: 0 });
  };

  const updateJoint = (id: string, patch: Partial<RigJoint>) => props.onRigChange({ ...rig, joints: rig.joints.map((joint) => joint.id === id ? { ...joint, ...patch } : joint) });
  const removeJoint = (id: string) => {
    const descendants = new Set([id]);
    let changed = true;
    while (changed) { changed = false; for (const joint of rig.joints) if (joint.parentJointId && descendants.has(joint.parentJointId) && !descendants.has(joint.id)) { descendants.add(joint.id); changed = true; } }
    const joints = rig.joints.filter((joint) => !descendants.has(joint.id));
    props.onRigChange(joints.length ? { ...rig, joints, bindPose: Object.fromEntries(Object.entries(rig.bindPose).filter(([key]) => !descendants.has(key))), poses: rig.poses.map((pose) => ({ ...pose, rotations: Object.fromEntries(Object.entries(pose.rotations).filter(([key]) => !descendants.has(key))) })) } : undefined);
  };

  const captureBind = () => {
    const bindPose = Object.fromEntries(rig.joints.map((joint) => [joint.id, props.rotations[joint.id] ?? joint.bindRotation]));
    props.onRigChange({ ...rig, bindPose, joints: rig.joints.map((joint) => ({ ...joint, bindRotation: bindPose[joint.id] })) });
  };
  const savePose = () => {
    const name = window.prompt("Pose name", "Attack");
    if (!name?.trim()) return;
    const id = slug(name);
    const pose = createNamedPose(rig, id, name.trim(), props.rotations);
    props.onRigChange({ ...rig, poses: [...rig.poses.filter((item) => item.id !== id), pose] });
  };

  return <section className="border-t border-zinc-800 pt-4 mt-4 space-y-3" data-testid="rig-editor-panel">
    <div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase text-amber-500"><Bone size={12}/> 2D Rig</span><button type="button" disabled={!props.selectedGroupId} onClick={addJoint} className="flex items-center gap-1 text-[9px] bg-zinc-800 px-2 py-1 rounded disabled:opacity-30"><Plus size={9}/> Joint</button></div>
    <div className="grid grid-cols-3 gap-1">
      <button type="button" disabled={available.length < 2} onClick={() => reference("jaw")} className="text-[8px] bg-zinc-800 rounded py-1 disabled:opacity-25">Jaw + teeth</button>
      <button type="button" disabled={available.length < 3} onClick={() => reference("leg")} className="text-[8px] bg-zinc-800 rounded py-1 disabled:opacity-25">3-joint leg</button>
      <button type="button" disabled={available.length < 10} onClick={() => reference("tail")} className="text-[8px] bg-zinc-800 rounded py-1 disabled:opacity-25">9-part tail</button>
    </div>
    {partJoints.map((joint) => <div key={joint.id} className="p-2 rounded border border-zinc-800 bg-zinc-950/60 space-y-1.5">
      <div className="flex items-center gap-1"><input value={joint.name} onChange={(event) => updateJoint(joint.id, { name: event.target.value })} className="min-w-0 flex-1 bg-transparent text-[9px] text-zinc-300 outline-none"/><button type="button" onClick={() => removeJoint(joint.id)}><Trash2 size={10}/></button></div>
      <select value={joint.parentJointId || ""} onChange={(event) => updateJoint(joint.id, { parentJointId: event.target.value || undefined })} className="w-full bg-zinc-900 text-[8px] rounded p-1"><option value="">No parent</option>{rig.joints.filter((item) => item.id !== joint.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <div className="flex justify-between text-[8px]"><span>{joint.minRotation}°</span><span className="text-amber-400">{Math.round(props.rotations[joint.id] ?? rig.bindPose[joint.id] ?? 0)}°</span><span>{joint.maxRotation}°</span></div>
      <input type="range" min={joint.minRotation} max={joint.maxRotation} value={props.rotations[joint.id] ?? rig.bindPose[joint.id] ?? 0} onChange={(event) => props.onRotationsChange({ ...props.rotations, [joint.id]: Number(event.target.value) })} className="w-full accent-amber-500"/>
      <div className="grid grid-cols-2 gap-1"><label className="text-[8px]">Min<input type="number" value={joint.minRotation} onChange={(event) => updateJoint(joint.id, { minRotation: Number(event.target.value) })} className="w-full bg-zinc-900 rounded px-1"/></label><label className="text-[8px]">Max<input type="number" value={joint.maxRotation} onChange={(event) => updateJoint(joint.id, { maxRotation: Number(event.target.value) })} className="w-full bg-zinc-900 rounded px-1"/></label></div>
    </div>)}
    {rig.joints.length > 0 && <><div className="grid grid-cols-2 gap-1"><button type="button" onClick={captureBind} className="flex items-center justify-center gap-1 text-[8px] bg-zinc-800 rounded py-1"><Save size={9}/> Set bind pose</button><button type="button" onClick={savePose} className="flex items-center justify-center gap-1 text-[8px] bg-zinc-800 rounded py-1"><Save size={9}/> Save pose</button></div>{rig.poses.length > 0 && <select defaultValue="" onChange={(event) => { const pose = rig.poses.find((item) => item.id === event.target.value); if (pose) props.onRotationsChange(pose.rotations); }} className="w-full bg-zinc-900 text-[8px] rounded p-1"><option value="">Load named pose…</option>{rig.poses.map((pose) => <option key={pose.id} value={pose.id}>{pose.name}</option>)}</select>}</>}
  </section>;
};
