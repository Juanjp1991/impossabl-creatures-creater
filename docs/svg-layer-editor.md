# Stable SVG layer editor

The Phase 3 editor assigns every editable SVG group and shape a persisted, part-scoped ID. Existing IDs are preserved; missing or duplicate IDs receive deterministic replacements when the part first enters the editor. Saved adjustments therefore target IDs instead of traversal positions.

The hierarchical Layers panel follows SVG parent-child groups. It supports display names independently from permanent IDs, visibility, locking, bring forward, send backward, bring to front and send to back. Reordering changes the SVG child order and is therefore retained through save and package export/import.

Layer move, rotation, proportional scale, pivot and colour changes are written directly to the selected SVG element. Scaling can use the part's attachment anchor as its pivot so the joint remains fixed. Each part has a bounded fifty-step undo/redo history.

Selecting a layer displays a canvas selection box. Drag inside the box to move it, drag the circular handle to rotate, or use any of eight corner and side handles to resize. Proportional resizing can be toggled; when disabled, side handles change one axis independently. Anchor-fixed resizing remains available for connected artwork such as shoulders and jaws.

The current phase deliberately does not add Bézier node editing, bones or inverse kinematics.
